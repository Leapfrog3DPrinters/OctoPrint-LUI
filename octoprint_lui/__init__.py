# coding=utf-8
from __future__ import absolute_import

import logging
import time
import threading
import re
import subprocess
import netaddr
import os
import platform
import flask
import sys

from collections import OrderedDict
from pipes import quote
from functools import partial
from copy import deepcopy
from flask import jsonify, make_response, render_template, request

from tinydb import TinyDB, Query

import octoprint_lui.util

from octoprint_lui.util import exceptions

import octoprint.plugin
from octoprint.settings import settings
from octoprint.util import RepeatedTimer
from octoprint.settings import valid_boolean_trues
from octoprint.server import VERSION
from octoprint.server.util.flask import get_remote_address
from octoprint.events import Events

class LUIPlugin(octoprint.plugin.UiPlugin,
                octoprint.plugin.TemplatePlugin,
                octoprint.plugin.AssetPlugin,
                octoprint.plugin.SimpleApiPlugin,
                octoprint.plugin.BlueprintPlugin,
                octoprint.plugin.SettingsPlugin,
                octoprint.plugin.EventHandlerPlugin,
                octoprint.printer.PrinterCallback):

    def __init__(self):

        ##~ Global
        self.from_localhost = False
        self.debug = False

        ##~ Model specific variables
        self.model = None

        mac_path = os.path.expanduser('~')

        self.paths = {
            "Xeed" : {
                "update": "/home/lily/" ,
                "media": "/media/"
            },
            "Bolt" : {
                "update": "/home/pi/" ,
                "media": "/media/pi/"
            },
            "Xcel" : {
                "update": "/home/pi/" ,
                "media": "/media/pi/"
            },
            "Debug" : {
                "update": "/home/pi/" ,
                "media": "/media/pi/"
            },
            "MacDebug" :
            {
                "update": "{mac_path}/lpfrg/".format(mac_path=mac_path),
                "media": "{mac_path}/lpfrg/GCODE/".format(mac_path=mac_path),
            },
            "WindowsDebug" : {
                "update": "C:\\Users\\erikh\\OneDrive\\Programmatuur\\",
                "media": "C:\\Tijdelijk\\usb\\"
            },
        }

        ##~ Filament loading variables
        self.extrusion_mode = "absolute"
        self.movement_mode = "absolute"
        self.last_movement_mode = "absolute"

        self.relative_extrusion_trigger = False
        self.current_print_extrusion_amount = None
        self.last_print_extrusion_amount = 0.0
        self.last_send_filament_amount = None
        self.last_saved_filament_amount = None
        self.loading_for_purging = False

        self.last_extrusion = 0
        self.current_extrusion = 0

        self.filament_amount = None
        self.filament_action = False

        self.default_material = {
            "bed": 0,
            "extruder": 0,
            "name": "None"
        }

        self.regexExtruder = re.compile("(^|[^A-Za-z][Ee])(-?[0-9]*\.?[0-9]+)")

        self.filament_change_tool = None
        self.filament_change_profile = None
        self.filament_change_amount = 0
        self.load_amount = 0
        self.load_filament_timer = None
        self.load_extrusion_amount = 0
        self.load_extrusion_speed = 0
        self.filament_in_progress = False

        self.temperature_safety_timer = None

        ##~ TinyDB

        self.filament_database_path = None
        self._filament_query = None
        self.filament_database = None
        self.machine_database_path = None
        self.machine_database = None
        self._machine_query = None
        self.machine_info = None



        ##~ Temperature status
        self.tool_status = [
            {'name': 'Right', "status": 'IDLE', "text": "Idle", 'css_class': "bg-none"},
            {'name': 'Left', "status": 'IDLE', "text": "Idle", 'css_class': "bg-none"},
            {'name': 'Bed', "status": 'IDLE', "text": "Idle", 'css_class': "bg-none"},
        ]

        self.old_temperature_data = None
        self.current_temperature_data = None
        self.temperature_window = 6
        self.ready_timer_default = {'tool0': 5, 'tool1': 5, 'bed': 5}
        self.ready_timer = {'tool0': 0, 'tool1': 0, 'bed': 0}
        self.callback_mutex = threading.RLock()
        self.callbacks = list()

        self.temp_before_filament_detection = { 'tool0' : 0, 'tool1' : 0 }

        self.print_mode = "normal"

        ##~ Homing
        self.home_command_sent = False
        self.is_homed = False
        self.is_homing = False

        ##~ Firmware
        self.firmware_info_command_sent = False
        # Properties to be read from the firmware. Local (python) property : Firmware property. Must be in same order as in firmware!
        self.firmware_info_properties = OrderedDict()
        self.firmware_info_properties["firmware_version"] = "Leapfrog Firmware"
        self.firmware_info_properties["machine_type"] = "Model"
        self.firmware_info_properties["extruder_offset_x"] = "X"
        self.firmware_info_properties["extruder_offset_y"] = "Y"
        self.firmware_info_properties["bed_width_correction"] = "bed_width_correction"

        ##~ USB and file browser
        self.is_media_mounted = False

        ##~ Calibration
        self.calibration_type = None
        self.levelbed_command_sent = False

        #TODO: make this more pythonic
        self.browser_filter = lambda entry, entry_data: \
                                ('type' in entry_data and (entry_data["type"]=="folder" or entry_data["type"]=="machinecode")) \
                                 or octoprint.filemanager.valid_file_type(entry, type="machinecode")

        self.browser_filter_firmware = lambda entry, entry_data: \
                                ('type' in entry_data and (entry_data["type"]=="folder" or entry_data["type"]=="firmware")) \
                                 or octoprint.filemanager.valid_file_type(entry, type="firmware")

        ##~ Power Button
        self.powerbutton_handler = None

        ##~ Update
        self.fetching_updates = False

    def initialize(self):
        #~~ get debug from yaml
        self.debug = self._settings.get_boolean(["debug_lui"])

        #~~ Register plugin as PrinterCallback instance
        self._printer.register_callback(self)

        ##~ TinyDB - filament
        self.filament_database_path = os.path.join(self.get_plugin_data_folder(), "filament.json")
        self.filament_database = TinyDB(self.filament_database_path)
        self._filament_query = Query()
        if self.filament_database.all() == []:
            self._logger.info("No filament database found creating one...")
            self.filament_database.insert_multiple({'tool':'tool'+ str(i), 'amount':0,
                                                    'material': self.default_material} for i in range(2))
        ##~ TinyDB - firmware
        #TODO: Do insert if property is not found (otherwise update fails later on)
        self.machine_database_path = os.path.join(self.get_plugin_data_folder(), "machine.json")
        self.machine_database = TinyDB(self.machine_database_path)
        self._machine_query = Query() # underscore for blueprintapi compatability
        if self.machine_database.all() == []:
            self._logger.info("No machine database found creating one...")
            self.machine_database.insert_multiple({ 'property': key, 'value': '' } for key in self.firmware_info_properties.keys())

        self.machine_info = self._get_machine_info()
        self.model = self.machine_info['machine_type']
        if self.model == '':
            ##~ Model
            if sys.platform == "darwin":
                self.model = "MacDebug"
            elif sys.platform == "win32":
                self.model = "WindowsDebug"
            elif os.path.exists('/home/pi'):
                self.model = "Bolt"
            elif sys.platform == "linux2":
                self.model = "Xeed"
            else:
                self.model = "Xeed"

        # TODO REMOVE
        if self.model == 'Unknown':
            self.model = 'MacDebug'

        self._logger.info("Platform: {platform}, model: {model}".format(platform=sys.platform, model=self.model))

        ##~ USB init
        self._init_usb()

        ##~ Init Update
        self._init_update()

        ##~ Add actions
        self._add_actions()

        ##~ Get filament amount stored in config
        self.update_filament_amount()

        ##~ Usernames that cannot be removed
        self.reserved_usernames = ['local', 'bolt', 'xeed', 'xcel']

        ##~ Bed calibration positions
        ## TODO: Make these dynamic. Maybe extend with Z and use it as generic positions table?
        self.manual_bed_calibration_tool = None
        self.manual_bed_calibration_positions = dict()
        self.manual_bed_calibration_positions["Bolt"] = []
        self.manual_bed_calibration_positions["Bolt"].append({ 'tool': 'tool1', 'X': 70, 'Y': 250, 'mode': 'normal' }) # 0=Top left
        self.manual_bed_calibration_positions["Bolt"].append({ 'tool': 'tool0', 'X': 305, 'Y': 250, 'mode': 'normal' }) # 1=Top right
        self.manual_bed_calibration_positions["Bolt"].append({ 'tool': 'tool1', 'X': 70, 'Y': 70, 'mode': 'normal' }) # 2=Bottom left
        self.manual_bed_calibration_positions["Bolt"].append({ 'tool': 'tool0', 'X': 305, 'Y': 70, 'mode': 'normal' }) #3=Bottom right
        self.manual_bed_calibration_positions["Bolt"].append({ 'tool': 'tool1', 'X': 175, 'Y': 160, 'mode': 'mirror' }) #4=Center
        self.manual_bed_calibration_positions["WindowsDebug"] = deepcopy(self.manual_bed_calibration_positions["Bolt"])


    ##~ Update

    @octoprint.plugin.BlueprintPlugin.route("/update", methods=["GET"])
    def get_updates(self):
        # Only update if we passed 30 min since last fetch or if we are forced
        force = request.values.get("force", "false") in valid_boolean_trues
        current_time = time.time()
        cache_time_expired = (current_time - self.last_git_fetch) > 3600
        if not cache_time_expired and not force:
            self._logger.debug("Cache time of updates not expired, so not fetching updates yet")
        # Not the complete update_info array has to be send to front end
        update_frontend = self._create_update_frontend(self.update_info)
        if (cache_time_expired or force) and not self.fetching_updates:
            self._logger.debug("Cache time expired or forced to fetch gits. Start fetch worker.  ")
            self._fetch_update_info_list(force)
            return make_response(jsonify(status="fetching", update=update_frontend, machine_info=self.machine_info), 200)
        return make_response(jsonify(status="cache", update=update_frontend, machine_info=self.machine_info), 200)

    @octoprint.plugin.BlueprintPlugin.route("/update", methods=["POST"])
    def do_updates(self):
        plugin = request.json["plugin"]
        update_info = self.update_info
        plugin_names = [update['name'] for update in update_info]
        if plugin == "all":
            # Updating all plugins
            # Start update thread with all updates
            self._logger.debug("Starting update of all installed plugins")
            self._update_plugins(plugin)
            # Send to front end that we started updating
            return make_response(jsonify(status="updating", text="Starting update of all modules"), 200)
            pass
        elif plugin:
            # Going to update only a single plugin part this is for debugging purpouse only
            # Check if plugin is installed:
            if plugin not in plugin_names:
                #if not return a fail
                self._logger.debug("{plugin} seemed to not be installed".format(plugin=plugin))
                return make_response("Failed to start update of plugin: {plugin}. Not installed.".format(plugin=plugin), 400)
            self._logger.debug("Starting update of {plugin}".format(plugin=plugin))
            # Send updating to front end
            self._update_plugins(plugin)
            return make_response(jsonify(status="updating", text="Starting update of {plugin}".format(plugin=plugin)), 200)

        else:
            # We didn't get a plugin, should never happen
            self._logger.debug("No plugin given! Can't update that.")
            return make_response("No plugin given, can't update", 400)

    def _update_plugins(self, plugin):
        plugins_to_update = []
        if plugin == "all":
            for update in self.update_info:
                if update["update"]:
                    plugins_to_update.append(update)
        else:
            for update in self.update_info:
                if update["name"] == plugin:
                    plugins_to_update.append(update)
        if not plugins_to_update:
            self._logger.debug("The updated plugin list remained empty. Can't start an empty update list.")
            return self._send_client_message("update_error")

        update_thread = threading.Thread(target=self._update_worker, args=((plugins_to_update,)))
        update_thread.daemon = False
        update_thread.start()

    def _update_worker(self, plugins):
        for plugin in plugins:
            try:
                #Actually running the updates here
                returncode, text, error = octoprint_lui.util.execute(plugin["command"], plugin["path"])
                self._logger.info("Text: {text}".format(text=text))
            except exceptions.ScriptError as e:
                # We are throwing an error here because the update failed
                # Send the error message to
                self._logger.info("Update error! Message: {text} Erro: {error}".format(text=e.stdout, error=e.stderr))
                self._send_client_message("update_error")
                # We encountered an error lets just return out of this and see what went wrong in the logs.
                return

        # We made it! We have updated everything, send this great news to the front end
        self._logger.info("Update done!")
        self._send_client_message("update_success")

        # And let's just restart the service also
        return self._perform_service_restart()


    def _fetch_update_info_list(self, force):
        fetch_thread = threading.Thread(target=self._fetch_worker, args=(self.update_info, force))
        fetch_thread.daemon = False
        fetch_thread.start()

    def _create_update_frontend(self, update_info):
        for update in update_info:
            update_frontend = [{'name': update['name'], 'update': update['update'], 'version': update['version']} for update in update_info]
        return update_frontend

    def _fetch_worker(self, update_info, force):
        if not octoprint_lui.util.is_online():
            # Only send a message to the front end if the user requests the update
            if force:
                self.send_client_internet_offline()
            # Return out of the worker, we can't update - not online
            return

        if not octoprint_lui.util.github_online():
            # Only send a message to the front end if the user requests the update
            if force:
                self.send_client_github_offline()
            # Return out of the worker, we can't update - not online
            return
        try:
            self.fetching_updates = True
            self._fetch_all_repos(update_info)
            update_info_updated = self._update_needed_version_all(update_info)
            self.update_info = update_info_updated
        except Exception as e:
            self._logger.debug("Something went wrong in the git fetch thread: {error}".format(error= e))
            return self._send_client_message("update_fetch_error")
        finally:
            self.fetching_updates = False

        self._get_firmware_info()
        data = dict(update=self._create_update_frontend(self.update_info), machine_info=  self.machine_info)
        return self._send_client_message("update_fetch_success", data)



    def _fetch_all_repos(self, update_info):
        ##~ Make sure we only fetch if we haven't for half an hour or if we are forced
        for update in update_info:
            self._fetch_git_repo(update['path'])
        self.last_git_fetch = time.time()

    def _update_needed_version_all(self, update_info):
        for update in update_info:
            update['update'] = self._is_update_needed(update['path'])
            plugin_info = self._plugin_manager.get_plugin_info(update['identifier'])
            if plugin_info:
                update['version'] = plugin_info.version
        return update_info

    def _is_update_needed(self, path):
        local = None
        remote = None
        base = None

        try:
            local = subprocess.check_output(['git', 'rev-parse', '@'], cwd=path)
        except subprocess.CalledProcessError as e:
            self._logger.warn("Git check failed for local:{path}. Output: {output}".format(path=path, output = e.output))

        try:
            remote = subprocess.check_output(['git', 'rev-parse', '@{upstream}'], cwd=path)
        except subprocess.CalledProcessError as e:
            self._logger.warn("Git check failed for remote:{path}. Output: {output}".format(path=path, output = e.output))

        try:
            base = subprocess.check_output(['git', 'merge-base', '@', '@{u}'], cwd=path)
        except subprocess.CalledProcessError as e:
            self._logger.warn("Git check failed for base:{path}. Output: {output}".format(path=path, output = e.output))

        if not local or not remote or not base:
            return True ## If anything failed, at least try to pull

        if (local == remote):
            ##~ Remote and local are the same, git is up-to-date
            self._logger.debug("Git with path: {path} is up-to-date".format(path=path))
            return False
        elif(local == base):
            ##~ Local is behind, we need to pull
            self._logger.debug("Git with path: {path} needs to be pulled".format(path=path))
            return True
        elif(remote == base):
            ##~ This should never happen and should actually call a fresh reset of the git TODO
            self._logger.debug("Git with path: {path} needs to be pushed".format(path=path))
            return True


    def _fetch_git_repo(self, path):
        # Set octoprint git remote to Leapfrog:
        # Out for now, feels  way too hacky.
        # if path is self.update_info[4]['path']:
        #     try:
        #         remote_git = subprocess.check_output(['git', 'remote', '-v'],cwd=path)
        #     except subprocess.CalledProcessError as err:
        #         self._logger.warn("Can't get remote gits with path: {path}. {err}".format(path=path, err=err))
        #     if 'foosel' in remote_git:
        #         try:
        #             update_remote_git = subprocess.check_output(['git', 'remote', 'set-url', 'origin', 'https://github.com/Leapfrog3DPrinters/OctoPrint.git'],cwd=path)
        #         except subprocess.CalledProcessError as err:
        #             self._logger.warn("Can't set remote url with path: {path}. {err}".format(path=path, err=err))
        #     self._logger.info("Changed git remote repo!")

        try:
            output = subprocess.check_output(['git', 'fetch'],cwd=path)
        except subprocess.CalledProcessError as err:
            self._logger.warn("Can't fetch git with path: {path}. {err}".format(path=path, err=err))
        self._logger.debug("Fetched git repo: {path}".format(path=path))


    ##~ OctoPrint Settings
    def get_settings_defaults(self):
        return {
            "model": self.model,
            "zoffset": 0,
            "action_door": True,
            "action_filament": True,
            "debug_lui": False,
        }

    ##~ OctoPrint UI Plugin
    def will_handle_ui(self, request):
        return True

    def on_ui_render(self, now, request, render_kwargs):
        remote_address = get_remote_address(request)
        localhost = netaddr.IPSet([netaddr.IPNetwork("127.0.0.0/8")])
        if remote_address is None:
            from_localhost = True
        else:
            from_localhost = netaddr.IPAddress(remote_address) in localhost

        response = make_response(render_template("index_lui.jinja2", local_addr=from_localhost, model=self.model, debug_lui=self.debug, **render_kwargs))

        if from_localhost:
            from octoprint.server.util.flask import add_non_caching_response_headers
            add_non_caching_response_headers(response)

        return response

    def is_blueprint_protected(self):
        # By default, the routes to LUI are not protected. SimpleAPI calls are protected though.
        return False

    @octoprint.plugin.BlueprintPlugin.route("/webcamstream", methods=["GET"])
    def webcamstream(self):
        # self._check_localhost() out for now I think Erik wants to refactor the localhost check,
        # which we indeed should do, code copy sucks
        response = make_response(render_template("windows_lui/webcam_window_lui.jinja2", model=self.model, debug_lui=self.debug))
        return response

    def get_ui_additional_key_data_for_cache(self):
        remote_address = get_remote_address(request)
        if remote_address is None:
            from_localhost = True
        else:
            localhost = netaddr.IPSet([netaddr.IPNetwork("127.0.0.0/8")])
            from_localhost = netaddr.IPAddress(remote_address) in localhost

        return "local" if from_localhost else "remote"

    def get_ui_additional_request_data_for_preemptive_caching(self):
        return dict(environ_overrides=dict(REMOTE_ADDR=get_remote_address(request)))

    def get_ui_additional_unless(self):
        remote_address = get_remote_address(request)
        return remote_address is None

    def get_ui_preemptive_caching_enabled(self):
        return True

    ##~ OctoPrint SimpleAPI Plugin
    def on_api_get(self, request = None):
        # Because blueprint is not protected, manually check for API key
        octoprint.server.util.apiKeyRequestHandler()

        command = None

        if("command" in request.values):
            command = request.values["command"]

        if(command == "get_files"):
            return self._on_api_command_get_files(request.values["origin"])
        elif(command == "is_media_mounted"):
            return jsonify({ "is_media_mounted" : self.is_media_mounted })
        elif(command == "storage_info"):
            import psutil
            usage = psutil.disk_usage(self._settings.global_get_basefolder("timelapse"))
            return jsonify(free=usage.free, total=usage.total)
        else:
            machine_info = self._get_machine_info()
            result = dict({
                'machine_info': machine_info,
                'filaments': self.filament_database.all(),
                'is_homed': self.is_homed,
                'is_homing': self.is_homing,
                'reserved_usernames': self.reserved_usernames,
                'tool_status': self.tool_status
                })
            return jsonify(result)

    def get_api_commands(self):
            return dict(
                    change_filament = ["tool"],
                    change_filament_cancel = [],
                    change_filament_done = [],
                    filament_detection_cancel = [],
                    filament_detection_complete = [],
                    unload_filament = [],
                    load_filament = ["profileName", "amount"],
                    load_filament_cont = ["tool", "direction"],
                    load_filament_cont_stop = [],
                    update_filament = ["tool", "amount", "profileName"],
                    move_to_filament_load_position = [],
                    move_to_maintenance_position = [],
                    temperature_safety_timer_cancel = [],
                    begin_homing = [],
                    get_files = ["origin"],
                    select_usb_file = ["filename"],
                    copy_gcode_to_usb = ["filename"],
                    delete_all_uploads = [],
                    copy_timelapse_to_usb = ["filename"],
                    delete_all_timelapses = [],
                    start_calibration = ["calibration_type"],
                    set_calibration_values = ["width_correction", "extruder_offset_y"],
                    restore_calibration_values = [],
                    prepare_for_calibration_position = [],
                    move_to_calibration_position = ["corner_num"],
                    restore_from_calibration_position = [],
                    start_print = ["mode"],
                    unselect_file = [],
                    trigger_debugging_action = [] #TODO: Remove!
            )

    def on_api_command(self, command, data):
        # Data already has command in, so only data is needed
        return self._call_api_method(**data)

    #TODO: Remove
    def _on_api_command_trigger_debugging_action(self, *args, **kwargs):
        """
        Allows to trigger something in the back-end. Wired to the logo on the front-end. Should be removed prior to publishing
        """
        self._on_powerbutton_press()

    def _on_api_command_unselect_file(self):
        self._printer.unselect_file()

    def _on_api_command_start_print(self, mode):
        self.print_mode = mode
        if mode == "sync":
            self._printer.commands(["M605 S2"])
        elif mode == "mirror":
            self._printer.commands(["M605 S3"])
        else:
            self._printer.commands(["M605 S1"])

        self._printer.start_print()

    def _on_api_command_prepare_for_calibration_position(self):
        if self.model == "Bolt":
            self._printer.commands(["M605 S0"])
            self.print_mode = "normal"

        self.set_movement_mode("absolute")
        self._printer.home(['x', 'y', 'z'])
        self._printer.change_tool("tool1")
        self.manual_bed_calibration_tool = "tool1"
        self._printer.commands(["M84 S600"]) # Set stepper disable timeout to 10min

    def _on_api_command_move_to_calibration_position(self, corner_num):
        # TODO HERE
        corner = self.manual_bed_calibration_positions[self.model][corner_num]
        self._printer.commands(['G1 Z5 F1200'])

        if self.model == "Bolt":
            if corner["mode"] == 'normal' and not self.print_mode == "normal":
                self._printer.commands(["M605 S0"])
                self._printer.home(['x'])
                self.print_mode = "normal"
            elif corner["mode"] == 'mirror' and not self.print_mode == "mirror":
                self._printer.commands(["M605 S3"])
                self._printer.home(['x'])
                self.print_mode = "mirror"

        if not self.manual_bed_calibration_tool or self.manual_bed_calibration_tool != corner["tool"]:
            self._printer.home(['x'])
            self._printer.change_tool(corner["tool"])
            self.manual_bed_calibration_tool = corner["tool"]

        self._printer.commands(["G1 X{} Y{} F6000".format(corner["X"],corner["Y"])])
        self._printer.commands(['G1 Z0 F1200'])

    def _on_api_command_restore_from_calibration_position(self):
        self._printer.commands(['G1 Z5 F1200'])
        self._printer.commands(["M605 S1"])
        self._printer.home(['y', 'x'])

        if self.model == "Bolt":
            self._printer.commands(["M84 S60"]) # Reset stepper disable timeout to 60sec
            self._printer.commands(["M84"]) # And disable them right away for now

        self.restore_movement_mode()

    def _on_api_command_start_calibration(self, calibration_type):
        self.calibration_type = calibration_type

        self._disable_timelapse()

        if calibration_type == "bed_width_small":
            calibration_src_filename = "BoltBedWidthCalibration_100um.gcode"
        elif calibration_type == "bed_width_large":
            calibration_src_filename = "BoltBedWidthCalibration_1mm.gcode"

        abs_path = self._copy_calibration_file(calibration_src_filename)

        if abs_path:
            self._printer.commands(["M605 S1"])
            self._preheat_for_calibration()
            self._printer.select_file(abs_path, False, True)

    def _preheat_for_calibration(self):
        targetBedTemp = 0

        for tool in ["tool0", "tool1"]:
            extruder = self.filament_database.get(self._filament_query.tool == tool)
            targetTemp = int(extruder["material"]["extruder"])
            bedTemp = int(extruder["material"]["bed"])

            if bedTemp > targetBedTemp:
                targetBedTemp = bedTemp

            self.heat_to_temperature(tool, targetTemp)

        if targetBedTemp > 0:
            self.heat_to_temperature("bed", targetBedTemp)

    def _copy_calibration_file(self, calibration_src_filename):
        calibration_src_path = None
        calibration_dst_filename = "calibration.gcode"
        calibration_dst_relpath = ".calibration"
        calibration_dst_path = octoprint.server.fileManager.join_path(octoprint.filemanager.FileDestinations.LOCAL, calibration_dst_relpath, calibration_dst_filename)
        calibration_src_path = os.path.join(self._basefolder, "gcodes", calibration_src_filename)

        upload = octoprint.filemanager.util.DiskFileWrapper(calibration_src_filename, calibration_src_path, move = False)

        try:
            # This will do the actual copy
            added_file = octoprint.server.fileManager.add_file(octoprint.filemanager.FileDestinations.LOCAL, calibration_dst_path, upload, allow_overwrite=True)
        except octoprint.filemanager.storage.StorageError:
            self._send_client_message("calibration_failed", { "calibration_type": self.calibration_type})
            return None

        return octoprint.server.fileManager.path_on_disk(octoprint.filemanager.FileDestinations.LOCAL, added_file)

    def _disable_timelapse(self):
        config = self._settings.global_get(["webcam", "timelapse"], merged=True)
        config["type"] = "off"

        octoprint.timelapse.configure_timelapse(config, False)

    def _restore_timelapse(self):
        config = self._settings.global_get(["webcam", "timelapse"], merged=True)
        octoprint.timelapse.configure_timelapse(config, False)

    def _on_calibration_event(self, event):
        #TODO: Temporary disable timelapse, gcoderendering etc
        if event == Events.PRINT_STARTED:
            self._send_client_message("calibration_started", { "calibration_type": self.calibration_type})
        elif event == Events.PRINT_PAUSED: # TODO: Handle these cases or disable pause/resume when calibrating
            self._send_client_message("calibration_paused", { "calibration_type": self.calibration_type})
        elif event == Events.PRINT_RESUMED: # TODO: Handle these cases or disable pause/resume when calibrating
            self._send_client_message("calibration_resumed", { "calibration_type": self.calibration_type})
        elif event == Events.PRINT_DONE:
            self._send_client_message("calibration_completed", { "calibration_type": self.calibration_type})
            self.calibration_type = None
            self._restore_timelapse()
        elif event == Events.PRINT_FAILED or event == Events.ERROR:
            self._send_client_message("calibration_failed", { "calibration_type": self.calibration_type})
            self.calibration_type = None
            self._restore_timelapse()

    def _on_api_command_set_calibration_values(self, width_correction, extruder_offset_y, persist = False):
        self._logger.debug("Setting {0} calibration values: {1}, {2}".format("persisting" if persist else "non-persisting",width_correction, extruder_offset_y))

        if self.model == "Bolt":
            #TODO: Consider changing firmware to accept positive value for S (M115, M219 and EEPROM_printSettings)
            self._printer.commands("M219 S%f" % -width_correction)
            self._printer.commands("M50 Y%f" % extruder_offset_y)

        if persist:
            self._printer.commands("M500")

        # Read back from machine (which may constrain the correction value) and store
        self._get_firmware_info()

    def _on_api_command_restore_calibration_values(self):
        self._printer.commands("M501")
        # Read back from machine (which may constrain the correction value) and store
        self._get_firmware_info()

    def _on_api_command_begin_homing(self):
        self._printer.commands('G28')
        self.send_client_is_homing()


    def _on_api_command_temperature_safety_timer_cancel(self):
        if self.temperature_safety_timer:
            self.temperature_safety_timer.cancel()
            self.temperature_safety_timer = None
            self._send_client_message("temperature_safety", { "timer": self.temperature_safety_timer_value })

    def _on_api_command_filament_detection_cancel(self):
        self._printer.cancel_print()
        #TODO: cancel temperature timer

    def _on_api_command_filament_detection_complete(self):
        if self.filament_detection_tool_temperatures:
            for tool, data in self.filament_detection_tool_temperatures.items():
                if tool != 'time':
                    self._printer.set_temperature(tool, data['target'])

            self._logger.info("Filament detection complete. Restoring temperatures: {temps}".format(temps = self.filament_detection_tool_temperatures))
            self.filament_detection_tool_temperatures = None

        self.restore_z_after_filament_load()
        self._printer.toggle_pause_print()

    def _on_api_command_change_filament(self, tool, *args, **kwargs):
        # Send to the front end that we are currently changing filament.
        self.send_client_in_progress()
        # Set filament change tool and profile
        self.filament_change_tool = tool
        self.filament_loaded_profile = self.filament_database.get(self._filament_query.tool == tool)
        self._printer.change_tool(tool)

        self.move_to_filament_load_position()

        # Check if filament is loaded, if so report to front end.
        if (self.filament_loaded_profile['material']['name'] == 'None'):
            # No filament is loaded in this tool, directly continue to load section
            self.send_client_skip_unload();

        self._logger.info("Change filament called with tool: {tool}, profile: {profile} and {args}, {kwargs}".format(tool=tool, profile=self.filament_loaded_profile['material']['name'], args=args, kwargs=kwargs))

    def _on_api_command_unload_filament(self, *args, **kwargs):
        # Heat up to old profile temperature and unload filament
        temp = int(self.filament_loaded_profile['material']['extruder'])

        self.heat_to_temperature(self.filament_change_tool,
                                temp,
                                self.unload_filament)
        self._logger.info("Unload filament called with {args}, {kwargs}".format(args=args, kwargs=kwargs))

    def _on_api_command_load_filament(self, profileName, amount, *args, **kwargs):

        if (profileName == "None"):
            # The user wants to load a None profile. So we just finish the swap wizard
            self.send_client_finished(dict(profile=None))
            return None

        selectedProfile = None

        if profileName == "filament-detection" or profileName == "filament-detection-purge":
            # Get stored profile when filament detection was hit
            selectedProfile = self.filament_detection_profile
            temp = int(self.filament_detection_tool_temperatures[self.filament_change_tool]['target'])
        elif profileName == "purge":
            # Select current profile
            selectedProfile = self.filament_database.get(self._filament_query.tool == self.filament_change_tool)["material"]
            temp = int(selectedProfile['extruder'])
        else:
            # Find profile from key
            selectedProfile = self._get_profile_from_name(profileName)

            temp = int(selectedProfile['extruder'])

        # Heat up to new profile temperature and load filament
        self.filament_change_profile = selectedProfile

        if profileName == "filament-detection-purge" or profileName == "purge":
            self.filament_amount = self.get_filament_amount()
            tool_num = int(self.filament_change_tool[len("tool"):])
            self.filament_change_amount = self.filament_amount[tool_num]
            self.loading_for_purging = True
        else:
            self.loading_for_purging = False
            self.filament_change_amount = amount

        self._logger.info("Load filament called with profile {profile}, tool {tool}, amount {amount}, {args}, {kwargs}".format(profile=selectedProfile, tool=self.filament_change_tool, amount=self.filament_change_amount, args=args, kwargs=kwargs))

        self.heat_to_temperature(self.filament_change_tool,
                                temp,
                                self.load_filament)

    def _on_api_command_change_filament_cancel(self, *args, **kwargs):
        # Abort mission! Stop filament loading.
        # Cancel all heat up and reset
        # Loading has already started, so just cancel the loading
        # which will stop heating already.
        # self._printer.commands(["M605 S3"]) # mirror
        # self._printer.commands(["G1 X20"]) # wipe it
        # self._printer.commands(["M605 S0"]) # back to normal
        self._printer.home(['y', 'x'])
        self._printer.commands(["M84 S60"]) # Reset stepper disable timeout to 60sec
        self._printer.commands(["M84"]) # And disable them right away for now

        if self.load_filament_timer:
            self.load_filament_timer.cancel()
        # Other wise we haven't started loading yet, so cancel the heating
        # and clear all callbacks added to the heating.
        else:
            with self.callback_mutex:
                del self.callbacks[:]
            self._printer.set_temperature(self.filament_change_tool, 0.0)
            self.send_client_cancelled()
        self._logger.info("Cancel change filament called with {args}, {kwargs}".format(args=args, kwargs=kwargs))

    def _on_api_command_change_filament_done(self, *args, **kwargs):
        # Still don't know if this is the best spot TODO
        if self.load_filament_timer:
            self.load_filament_timer.cancel()
        # self._printer.commands(["M605 S3"]) # mirror
        # self._printer.commands(["G1 X20"]) # wipe it
        # self._printer.commands(["M605 S0"]) # back to normal
        self._printer.home(['y', 'x'])
        self._printer.commands(["M84 S60"]) # Reset stepper disable timeout to 60sec
        self._printer.commands(["M84"]) # And disable them right away for now
        self._printer.set_temperature(self.filament_change_tool, 0.0)
        self._logger.info("Change filament done called with {args}, {kwargs}".format(args=args, kwargs=kwargs))

    def _on_api_command_update_filament(self, tool, amount, profileName, *args, **kwargs):
        self._logger.info("Update filament amount called with {args}, {kwargs}".format(args=args, kwargs=kwargs))
        # Update the filament amount that is logged in tha machine
        if profileName == "None":
            update_profile = {
                "amount": 0,
                "material": self.default_material
            }
        else:
            selectedProfile = self._get_profile_from_name(profileName)
            update_profile = {
                "amount": amount,
                "material": selectedProfile
            }
        self.set_filament_profile(tool, update_profile)
        self.update_filament_amount()
        self.send_client_filament_amount()

    def _on_api_command_load_filament_cont(self, tool, direction, *args, **kwargs):
        self.load_filament_cont(tool, direction)

    def _on_api_command_load_filament_cont_stop(self, *args, **kwargs):
        if self.load_filament_timer:
            self.load_filament_timer.cancel()

    def _on_api_command_move_to_filament_load_position(self, *args, **kwargs):
        self.move_to_filament_load_position()

    def _on_api_command_move_to_maintenance_position(self, *args, **kwargs):
        self.move_to_maintenance_position()

    def _on_api_command_get_files(self, origin, *args, **kwargs):

        if(origin == "usb"):
            # Read USB files pretty much like an SD card
            # Alternative:
            # files = self.usb_storage.list_files(recursive = True).values()

            if("filter" in request.values and request.values["filter"] == "firmware"):
                filter = self.browser_filter_firmware
            else:
                filter = self.browser_filter

            try:
                files = octoprint.server.fileManager.list_files("usb", filter=filter, recursive = True)["usb"].values()
            except Exception as e:
                return make_response("Could not access the media folder", 500)


            # Decorate them
            def analyse_recursively(files, path=None):
                if path is None:
                    path = ""

                for file in files:
                    file["origin"] = "usb"
                    file["refs"] = { "resource": "/api/plugins/lui/" }

                    if file["type"] == "folder":
                        file["children"] = analyse_recursively(file["children"].values(), path + file["name"] + "/")
                    elif file["type"] == "firmware":
                        file["refs"]["local_path"] = os.path.join(self.media_folder, path + file["name"])

                return files

            analyse_recursively(files)

            return jsonify(files=files)
        else:
            # Return original OctoPrint API response
            return octoprint.server.api.files.readGcodeFilesForOrigin(origin)

    def _on_api_command_select_usb_file(self, filename, *args, **kwargs):

        target = "usb"

        #TODO: Feels like it's not really secure. Fix
        path = os.path.join(self.media_folder, filename)
        if not (os.path.exists(path) and os.path.isfile(path)):
            return make_response("File not found on '%s': %s" % (target, filename), 404)

        # selects/loads a file
        if not octoprint.filemanager.valid_file_type(filename, type="machinecode"):
            return make_response("Cannot select {filename} for printing, not a machinecode file".format(**locals()), 415)

        printAfterLoading = False
        #if "print" in data.keys() and data["print"] in valid_boolean_trues:
        #    if not printer.is_operational():
        #        return make_response("Printer is not operational, cannot directly start printing", 409)
        #    printAfterLoading = True

        # Now the full path is known, remove any folder names from file name
        _, filename = octoprint.server.fileManager.split_path("usb", filename)

        self._logger.debug("File selected: %s" % path)

        upload = octoprint.filemanager.util.DiskFileWrapper(filename, path, move = False)

        #TODO: Find out if necessary and if so, implement using method arguments
        userdata = None
        if "userdata" in request.values:
            import json
            try:
                userdata = json.loads(request.values["userdata"])
            except:
                return make_response("userdata contains invalid JSON", 400)

        selectAfterUpload = True
        printAfterSelect = False

        # determine current job
        currentPath = None
        currentFilename = None
        currentOrigin = None
        currentJob = self._printer.get_current_job()
        if currentJob is not None and "file" in currentJob.keys():
            currentJobFile = currentJob["file"]
            if currentJobFile is not None and "name" in currentJobFile.keys() and "origin" in currentJobFile.keys() and currentJobFile["name"] is not None and currentJobFile["origin"] is not None:
                currentPath, currentFilename = octoprint.server.fileManager.sanitize(octoprint.filemanager.FileDestinations.LOCAL, currentJobFile["name"])
                currentOrigin = currentJobFile["origin"]

        # determine future filename of file to be uploaded, abort if it can't be uploaded
        try:
            futurePath, futureFilename = octoprint.server.fileManager.sanitize(octoprint.filemanager.FileDestinations.LOCAL, upload.filename)
        except:
            futurePath = None
            futureFilename = None

        if futureFilename is None:
            return make_response("Can not select file %s, wrong format?" % upload.filename, 415)

        if futurePath == currentPath and futureFilename == currentFilename and target == currentOrigin and (printer.is_printing() or printer.is_paused()):
            return make_response("Trying to overwrite file that is currently being printed: %s" % currentFilename, 409)

        def selectAndOrPrint(filename, absFilename, destination):
            if octoprint.filemanager.valid_file_type(added_file, "gcode") and (selectAfterUpload or printAfterSelect or (currentFilename == filename and currentOrigin == destination)):
                self._printer.select_file(absFilename, False, printAfterSelect)
            return filename

        futureFullPath = octoprint.server.fileManager.join_path(octoprint.filemanager.FileDestinations.LOCAL, futurePath, futureFilename)

        def on_selected_usb_file_copy():
            percentage = (float(os.path.getsize(futureFullPath)) / float(os.path.getsize(path))) * 100.0
            self._logger.debug("Copy progress: %f" % percentage)
            self._send_client_message("media_file_copy_progress", { "percentage" : percentage })

        is_copying = True

        def is_copying_selected_usb_file():
            return is_copying

        def copying_finished():
            self._send_client_message("media_file_copy_complete")

        # Start watching the final file to monitor it's filesize
        timer = RepeatedTimer(1, on_selected_usb_file_copy, run_first = False, condition = is_copying_selected_usb_file, on_finish = copying_finished)
        timer.start()

        try:
            # This will do the actual copy
            added_file = octoprint.server.fileManager.add_file(octoprint.filemanager.FileDestinations.LOCAL, futureFullPath, upload, allow_overwrite=True)
        except octoprint.filemanager.storage.StorageError as e:
            timer.cancel()
            if e.code == octoprint.filemanager.storage.StorageError.INVALID_FILE:
                return make_response("Could not upload the file \"{}\", invalid type".format(upload.filename), 400)
            else:
                return make_response("Could not upload the file \"{}\"".format(upload.filename), 500)
        finally:
             self._send_client_message("media_file_copy_failed")

        # Stop the timer
        is_copying = False

        if octoprint.filemanager.valid_file_type(added_file, "stl"):
            filename = added_file
            done = True
        else:
            filename = selectAndOrPrint(added_file, octoprint.server.fileManager.path_on_disk(octoprint.filemanager.FileDestinations.LOCAL, added_file), target)
            done = True

        if userdata is not None:
            # upload included userdata, add this now to the metadata
            octoprint.server.fileManager.set_additional_metadata(octoprint.filemanager.FileDestinations.LOCAL, added_file, "userdata", userdata)

        octoprint.server.eventManager.fire(octoprint.events.Events.UPLOAD, {"file": filename, "target": target})

        files = {}

        #location = flask.url_for(".readGcodeFile", target=octoprint.filemanager.FileDestinations.LOCAL, filename=filename, _external=True)
        location = "/files/" + octoprint.filemanager.FileDestinations.LOCAL + "/" + str(filename)

        files.update({
            octoprint.filemanager.FileDestinations.LOCAL: {
                "name": filename,
                "origin": octoprint.filemanager.FileDestinations.LOCAL,
                "refs": {
                    "resource": location,
                    "download": "downloads/files/" + octoprint.filemanager.FileDestinations.LOCAL + "/" + str(filename)
                }
            }
        })

        r = make_response(jsonify(files=files, done=done), 201)
        r.headers["Location"] = location

        return r

    def _copy_file_to_usb(self, filename, src_path, dst_folder, message_progress, message_complete, message_failed):
        # Loop through all directories in the media folder and find the mount with most free space
        bytes_available = 0
        drive_folder = None

        for mount in os.listdir(self.media_folder):
            mount_path = os.path.join(self.media_folder, mount)

            if not os.path.isdir(mount_path):
                continue

            #Check disk space
            if self.model == 'WindowsDebug':
                mount_bytes_available = 14 * 1024 * 1024 * 1024;
            else:
                disk_info = os.statvfs(mount_path)
                mount_bytes_available = disk_info.f_frsize * disk_info.f_bavail

            if mount_bytes_available > bytes_available:
                bytes_available = mount_bytes_available
                drive_folder = mount_path

        # Check if it is enough free space for the video file
        filesize = os.path.getsize(src_path)

        if filesize > bytes_available:
            return make_response("Insuffient space available on USB drive", 400)

        if drive_folder is None:
            return make_response("Insuffient space available on USB drive", 400)

        folder_path = os.path.join(drive_folder, dst_folder)
        new_full_path = os.path.join(folder_path, filename)

        self._logger.debug("Copying file to: %s" % new_full_path);

        # Helpers to check copying status
        def on_file_copy():
            newsize = float(os.path.getsize(new_full_path))
            totalsize = float(os.path.getsize(src_path))
            if totalsize > 0:
                percentage = newsize/totalsize * 100.0
            else:
                percentage = 0
            self._logger.debug("File copy progress: %f" % percentage)
            self._send_client_message(message_progress, { "percentage" : percentage })

        is_copying = True

        def is_copying_file():
            return is_copying

        def file_copying_finished():
            self._send_client_message(message_complete)

        # Start monitoring copy status
        timer = RepeatedTimer(1, on_file_copy, run_first = False, condition = is_copying_file, on_finish = file_copying_finished)
        timer.start()

        try:
            #Create directory, if needed
            if not os.path.isdir(folder_path):
                os.mkdir(folder_path)

            import shutil
            shutil.copy2(src_path, new_full_path)
        except Exception as e:
            timer.cancel()

            return make_response("File error during copying: %s" % e.message, 500)
        finally:
            is_copying = False
            self._send_client_message(message_failed)

        return make_response("OK", 200)


    def _on_api_command_copy_timelapse_to_usb(self, filename, *args, **kwargs):
        if not self.is_media_mounted:
            return make_response("Could not access the media folder", 400)

        if not octoprint.util.is_allowed_file(filename, ["mpg", "mpeg", "mp4"]):
            return make_response("Not allowed to copy this file", 400)

        timelapse_folder = self._settings.global_get_basefolder("timelapse")
        src_path = os.path.join(timelapse_folder, filename)

        self._copy_file_to_usb(filename, src_path, "Leapfrog-timelapses", "timelapse_copy_progress", "timelapse_copy_complete", "timelapse_copy_failed")

    def _on_api_command_delete_all_timelapses(self, *args, **kwargs):
        import shutil

        # Get the full path to the uploads folder
        timelapse_folder = self._settings.global_get_basefolder("timelapse")

        has_failed = False

        # Walk through all files
        for filename in os.listdir(timelapse_folder):
            file_path = os.path.join(timelapse_folder, filename)
            try:
                if os.path.isfile(file_path):
                    os.unlink(file_path)
                # Don't remove subfolders as they may contain images for current renders. OctoPrint handles their removal.
                #elif os.path.isdir(file_path): shutil.rmtree(file_path)
            except Exception as e:
                self._logger.exception("Could not delete file: %s" % filename)
                has_failed = True

        if has_failed:
            return make_response(jsonify(result = "Could not delete all files"), 500)
        else:
            return make_response(jsonify(result = "OK"), 200);

    def _on_api_command_copy_gcode_to_usb(self, filename, *args, **kwargs):
        if not self.is_media_mounted:
            return make_response("Could not access the media folder", 400)

        if not octoprint.filemanager.valid_file_type(filename, type="machinecode"):
            return make_response("Not allowed to copy this file", 400)

        uploads_folder = self._settings.global_get_basefolder("uploads")
        src_path = os.path.join(uploads_folder, filename)

        self._copy_file_to_usb(filename, src_path, "Leapfrog-gcodes", "gcode_copy_progress", "gcode_copy_complete", "gcode_copy_failed")

    def _on_api_command_delete_all_uploads(self, *args, **kwargs):
        import shutil

        # Find the filename of the current print job
        selectedfile = None

        if self._printer._selectedFile:
            selectedfile = self._printer._selectedFile["filename"]

        ## Pause any gcode analyses (which may have open file handles)
        #self._printer._analysisQueue.pause()
        #self._printer._analysisQueue

        # Get the full path to the uploads folder
        uploads_folder = self._settings.global_get_basefolder("uploads")

        has_failed = False

        # Walk through all files
        for filename in os.listdir(uploads_folder):
            if filename == selectedfile:
                continue

            file_path = os.path.join(uploads_folder, filename)
            try:
                if os.path.isfile(file_path):
                    os.unlink(file_path)
                elif os.path.isdir(file_path): shutil.rmtree(file_path) # Recursively delete all files in subfolders
            except Exception as e:
                self._logger.exception("Could not delete file: %s" % filename)
                has_failed = True

        ## Restart the analyses, if we're not printing
        #if self._printer._state != octoprint.util.comm.MachineCom.STATE_PRINTING:
        #    self._printer._analysisQueue.resume()

        if has_failed:
            return make_response(jsonify(result = "Could not delete all files"), 500)
        else:
            return make_response(jsonify(result = "OK"), 200);

    ##~ Load and Unload methods

    def load_filament(self, tool):
        ## Only start a timer when there is none running
        if self.load_filament_timer is None:
            # Always set load_amount to 0
            self.load_amount = 0
            self.set_extrusion_mode("relative")

            if self.loading_for_purging:
                self._logger.debug("load_filament for purging")
                load_initial=dict(amount=18.0, speed=2000)
                load_change = None
                self.load_amount_stop = 2
                self.loading_for_purging = False
            elif self.model == "Xeed": ## Switch on model for filament loading
                self._logger.debug("load_filament for Xeed")
                # We can set one change of extrusion and speed during the timer
                # Start with load_initial and change to load_change at load_change['start']
                load_initial=dict(amount=18.0, speed=2000)
                load_change=dict(start=1900, amount=2.5, speed=300)

                # Total amount being loaded
                self.load_amount_stop = 2100
            elif self.model == "Xcel":
                self._logger.debug("load_filament for Xcel")
                # We can set one change of extrusion and speed during the timer
                # Start with load_initial and change to load_change at load_change['start']
                # TODO: Check amounts
                load_initial=dict(amount=18.0, speed=2000)
                load_change=dict(start=2400, amount=2.5, speed=300)

                # Total amount being loaded
                self.load_amount_stop = 2600
            else:
                self._logger.debug("load_filament for Bolt")
                # Bolt loading
                load_initial=dict(amount=2.5, speed=240)
                load_change = None
                self.load_amount_stop = 200

            load_filament_partial = partial(self._load_filament_repeater, initial=load_initial, change=load_change)
            self.load_filament_timer = RepeatedTimer(0.5,
                                                    load_filament_partial,
                                                    run_first=True,
                                                    condition=self._load_filament_running,
                                                    on_condition_false=self._load_filament_condition,
                                                    on_cancelled=self._load_filament_cancelled,
                                                    on_finish=self._load_filament_finished)
            self.load_filament_timer.start()
            self.send_client_loading()

    def unload_filament(self, tool):
        ## Only start a timer when there is none running
        if self.load_filament_timer is None:
            ## This is xeed load function, TODO: Bolt! function and switch
            self.load_amount = 0
            self.set_extrusion_mode("relative")

            if self.model == "Xeed":
                # We can set one change of extrusion and speed during the timer
                # Start with load_initial and change to load_change at load_change['start']
                unload_initial=dict(amount= -2.5, speed=300)
                unload_change=dict(start=30, amount= -18, speed=2000)

                # Total amount being loaded
                self.load_amount_stop = 2100
            if self.model == "Xcel":
                # We can set one change of extrusion and speed during the timer
                # Start with load_initial and change to load_change at load_change['start']
                unload_initial=dict(amount= -2.5, speed=300)
                unload_change=dict(start=30, amount= -18, speed=2000)

                # Total amount being loaded
                self.load_amount_stop = 2600
            else:
                # Bolt stuff
                unload_initial=dict(amount= -2.5, speed=300)
                unload_change = None
                self.load_amount_stop = 150 #

            # Before unloading, always purge the machine 10 mm
            self._printer.commands(["G1 E10 F300"])

            # Start unloading
            unload_filament_partial = partial(self._load_filament_repeater, initial=unload_initial, change=unload_change) ## TEST TODO
            self.load_filament_timer = RepeatedTimer(0.5,
                                                    unload_filament_partial,
                                                    run_first=True,
                                                    condition=self._load_filament_running,
                                                    on_condition_false=self._unload_filament_condition,
                                                    on_cancelled=self._load_filament_cancelled,
                                                    on_finish=self._unload_filament_finished)
            self.load_filament_timer.start()
            self.send_client_unloading()


    def load_filament_cont(self, tool, direction):
        ## Only start a timer when there is none running
        if self.load_filament_timer is None:

            #This method can also be used for the Bolt!
            self.load_amount = 0
            self.load_amount_stop = 100 # Safety timer on continuious loading
            load_cont_initial = dict(amount=2.5 * direction, speed=240)
            self.set_extrusion_mode("relative")
            load_cont_partial = partial(self._load_filament_repeater, initial=load_cont_initial)
            self.load_filament_timer = RepeatedTimer(0.5,
                                                    load_cont_partial,
                                                    run_first=True,
                                                    condition=self._load_filament_running,
                                                    on_finish=self._load_filament_cont_finished)
            self.load_filament_timer.start()
            self.send_client_loading_cont()


    def _load_filament_repeater(self, initial, change=None):
        load_extrusion_amount = initial['amount']
        load_extrusion_speed = initial['speed']
        # Swap to the change condition
        if change:
            if (self.load_amount >= change['start']):
                load_extrusion_amount = change['amount']
                load_extrusion_speed = change['speed']

        # Set global load_amount
        self.load_amount += abs(load_extrusion_amount)
        # Run extrusion command
        self._printer.commands("G1 E%s F%d" % (load_extrusion_amount, load_extrusion_speed))

        # Check loading progress
        progress = int((self.load_amount / self.load_amount_stop) * 100)
        # Send message every other percent to keep data stream to minimum
        if progress % 2:
            self.send_client_loading_progress(dict(progress=progress))

    def _load_filament_running(self):
        return self.load_amount <= self.load_amount_stop

    def _load_filament_condition(self):
        self._logger.debug("_load_filament_condition")

        # When loading is complete, set new loaded filament
        new_filament = {
            "amount":  self.filament_change_amount,
            "material": self.filament_change_profile
        }
        self.set_filament_profile(self.filament_change_tool, new_filament)
        self.update_filament_amount()
        self.send_client_finished(dict(profile=new_filament))

    def _unload_filament_condition(self):
        # When unloading finished, set standard None filament.
        temp_filament = {
            "amount": 0,
            "material": self.default_material
        }
        self.set_filament_profile(self.filament_change_tool, temp_filament)
        self.update_filament_amount()
        self.send_client_skip_unload()

    def _load_filament_finished(self):
        self._logger.debug("_load_filament_finished")
        # Loading is finished, turn off heaters, reset load timer and back to normal movements
        self.restore_extrusion_mode()
        self.load_filament_timer = None

    def _unload_filament_finished(self):
        # Loading is finished, turn off heaters, reset load timer and back to normal movements
        self.restore_extrusion_mode()
        self.load_filament_timer = None

    def _load_filament_cont_finished(self):
        self._logger.debug("_load_filament_cont_finished")
        self.restore_extrusion_mode()
        self.load_filament_timer = None
        self.send_client_loading_cont_stop()

    def _load_filament_cancelled(self):
        # A load or unload action has been cancelled, turn off the heating
        # send cancelled info.
        self._printer.set_temperature(self.filament_change_tool, 0)
        self.send_client_cancelled()

    ##~ Helpers to send client messages
    def _send_client_message(self, message_type, data=None):

        if message_type != "tool_status":
            self._logger.debug("Sending client message with type: {type}, and data: {data}".format(type=message_type, data=data))

        self._plugin_manager.send_plugin_message(self._identifier, dict(type=message_type, data=data))

    def send_client_internet_offline(self):
        self._send_client_message('internet_offline')

    def send_client_github_offline(self):
        self._send_client_message('github_offline')

    def send_client_heating(self):
        self._send_client_message('tool_heating')

    def send_client_loading(self):
        self._send_client_message('filament_loading')

    def send_client_loading_cont(self):
        self._send_client_message('filament_loading_cont')

    def send_client_loading_cont_stop(self):
        self._send_client_message('filament_loading_cont_stop')

    def send_client_loading_progress(self, data=None):
        self._send_client_message('filament_load_progress', data)

    def send_client_unloading(self):
        self._send_client_message('filament_unloading')

    def send_client_finished(self, data=None):
        self._send_client_message('filament_finished', data)

    def send_client_cancelled(self):
        self._send_client_message('filament_cancelled')

    def send_client_skip_unload(self):
        self._send_client_message('skip_unload')

    def send_client_in_progress(self):
        self._send_client_message('filament_in_progress')

    def send_client_filament_amount(self):
        data = {"extrusion": self.current_print_extrusion_amount, "filament": self.filament_amount}
        self._send_client_message("update_filament_amount", data)

    def send_client_is_homing(self):
        self._send_client_message('is_homing')

    def send_client_is_homed(self):
        self._send_client_message('is_homed')

    def send_client_levelbed_complete(self):
        self._send_client_message('levelbed_complete')

    def send_client_levelbed_progress(self, max_correction_value):
        self._send_client_message('levelbed_progress', { "max_correction_value" : max_correction_value })

    def send_client_tool_status(self):
        self._send_client_message('tool_status', {"tool_status": self.tool_status})

    ## ~ Save helpers
    def set_filament_profile(self, tool, profile):
        self.filament_database.update(profile, self._filament_query.tool == tool)

    def get_filament_amount(self):
        filament_amount = [self.filament_database.get(self._filament_query.tool == "tool"+str(index))["amount"] for index in range(2)]
        return filament_amount

    def save_filament_amount(self):
        self.set_filament_amount("tool0")
        self.set_filament_amount("tool1")

    def update_filament_amount(self):
        self.filament_amount = self.get_filament_amount()
        self.last_send_filament_amount = deepcopy(self.filament_amount)
        self.last_saved_filament_amount = deepcopy(self.filament_amount)

    def set_filament_amount(self, tool):
        tool_num = self._get_tool_num(tool)
        self.filament_database.update({'amount': self.filament_amount[tool_num]}, self._filament_query.tool == tool)

    ## ~ Gcode script hook. Used for Z-offset Xeed
    def script_hook(self, comm, script_type, script_name):
        # The printer should get a positive number here. Altough for the user it might feel like - direction,
        # Thats how the M206 works.
        if not script_type == "gcode":
            return None

        if self.model == "Xeed" or self.model == "Xcel":
            zoffset = -self._settings.get_float(["zoffset"])


            if script_name == "beforePrintStarted":
                return ["M206 Z%.2f" % zoffset], None

            if script_name == "afterPrinterConnected":
                return ["M206 Z%.2f" % zoffset], None

        if self.model == "Bolt":
            if script_name == "beforePrintResumed":
                return ["G1 F6000"], None

            if script_name == "afterPrintPaused":
                return ["G28 X0"], None

    def gcode_queuing_hook(self, comm_instance, phase, cmd, cmd_type, gcode, *args, **kwargs):
        """
        Removes X0, Y0 and Z0 from G92 commands
        These commands are problamatic with different print modes.
        """
        if gcode and gcode == "G92":
            cmd = re.sub('[XYZ]0 ', '', cmd)
            return cmd,


    def gcode_sent_hook(self, comm_instance, phase, cmd, cmd_type, gcode, *args, **kwargs):
        """
        Uses the plugin gcode sent hook.
        Keeps track of extrusion amounts, needs to react to G92 due to extrusion zero-ing.
        Needs to keep track of relative or absolute extrusion mode. G90 / G91
        """
        if gcode:
            # Handle relative / absolute axis
            if (gcode == "G90" or gcode == "G91"):
                self._process_G90_G91(cmd)

            # Handle zero of axis
            elif gcode == "G92":
                self._process_G92(cmd)

            elif (gcode == "M82" or gcode == "M83"):
                self._process_M82_M83(cmd)

            ##~ For now only handle extrusion when actually printing a job
            elif (gcode == "G0" or gcode =="G1") and comm_instance.isPrinting():
                self._process_G0_G1(cmd, comm_instance)

            # Handle home command
            elif (gcode == "G28"):
                self._process_G28(cmd)

            # Handle info command
            elif (gcode == "M115"):
                self._process_M115(cmd)

            # Handle bed level command
            elif (gcode == "G32"):
                self._process_G32(cmd)

    def _process_G90_G91(self, cmd):
        ##~ Process G90 and G91 commands. Handle relative movement+extrusion
        if cmd == "G90":
            self.movement_mode = "absolute"

            if self.relative_extrusion_trigger :
                self.extrusion_mode = "relative"
            else:
                self.extrusion_mode = "absolute"
        else:
            self.movement_mode = "relative"
            self.extrusion_mode = "relative" #TODO: Not entirely correct. If G90 > G91 > G90, extrusion_mode would be incorrectly set to relative

        self._logger.debug("Command: %s" % cmd)
        #self._logger.info("New movement mode: %s" % self.movement_mode)
        #self._logger.info("New extrusion mode: %s" % self.extrusion_mode)

    def _process_M82_M83(self, cmd):
        ##~ Process M82 and M83 commands. Handle relative extrusion
        if cmd == "M82":
            self.extrusion_mode = self.movement_mode
            self.relative_extrusion_trigger = False
        else:
            self.extrusion_mode = "relative"
            self.relative_extrusion_trigger = True

        self._logger.debug("Command: %s" % cmd)
        #self._logger.info("New movement mode: %s" % self.movement_mode)
        #self._logger.info("New extrusion mode: %s" % self.extrusion_mode)

    def _process_G92(self, cmd):
        ##~ Process a G92 command and handle zero-ing of extrusion distances
        if self.regexExtruder.search(cmd):
            self.last_extrusion = 0
            self._logger.debug("Extruder zero: %s" % cmd)

    def _process_G0_G1(self, cmd, comm_instance):
        #self._logger.info("Command: %s" % cmd)

        ##~ Process a G0/G1 command with extrusion
        extrusion_code = self.regexExtruder.search(cmd)
        if extrusion_code is not None:
            tool = comm_instance.getCurrentTool()
            current_extrusion = float(extrusion_code.group(2))
            # Handle relative vs absolute extrusion
            if self.extrusion_mode == "relative":
                extrusion_amount = current_extrusion
            else:
                extrusion_amount = current_extrusion - self.last_extrusion
            # Add extrusion to current printing amount and remove from available filament
            # Use both tools when in sync or mirror mode.
            if self.print_mode == "sync" or self.print_mode == "mirror":
                for i, tool_name in enumerate(self.filament_amount):
                    self.filament_amount[i] -= extrusion_amount
                    self.current_print_extrusion_amount[i] += extrusion_amount
            # Only one tool in normal mode.
            else:
                self.current_print_extrusion_amount[tool] += extrusion_amount
                self.filament_amount[tool] -= extrusion_amount

            # Needed for absolute extrusion printing
            self.last_extrusion = current_extrusion

            if (self.last_send_filament_amount[tool] - self.filament_amount[tool] > 10):
                self.send_client_filament_amount()
                self.last_send_filament_amount = deepcopy(self.filament_amount)

            if (self.last_saved_filament_amount[tool] - self.filament_amount[tool] > 100):
                self.set_filament_amount("tool"+str(tool))
                self.last_saved_filament_amount = deepcopy(self.filament_amount)

    def _process_G28(self, cmd):
        #self._logger.info("Command: %s" % cmd)
        ##~ Only do this check at the start up for now
        ##~ TODO: Find when we want to make the printer not is_homed any more.
        if not self.is_homed:
            if (all(c in cmd for c in 'XYZ') or cmd == "G28"):
                self.home_command_sent = True
                self.is_homing = True

    def _process_M115(self, cmd):
        #self._logger.info("Command: %s" % cmd)
        self.firmware_info_command_sent = True

    def _process_G32(self, cmd):
        self.levelbed_command_sent = True

    def gcode_received_hook(self, comm_instance, line, *args, **kwargs):
        if self.firmware_info_command_sent:
            if "echo:" in line:
                self._on_firmware_info_received(line)

        if self.home_command_sent:
            if "ok" in line:
                self.home_command_sent = False
                self.is_homed = True
                self.is_homing = False
                self.send_client_is_homed()
                ##~ Now we have control over the printer, also take over control of the power button
                ##~ TODO: This runs also on normal G28s.
                self._init_powerbutton()

        if self.levelbed_command_sent:
            if "MaxCorrectionValue" in line:
                max_correction_value = line[19:]
                self.send_client_levelbed_progress(max_correction_value)
            if "ok" in line:
                self.levelbed_command_sent = False
                self.send_client_levelbed_complete()

        return line

    def hook_actiontrigger(self, comm, line, action_trigger):
        """
        Action trigger hook used for door and filament detection
        """
        if action_trigger == None:
            return
        elif action_trigger == "door_open" and self._settings.get_boolean(["action_door"]) and comm.isPrinting():
            self._send_client_message(action_trigger, dict(line=line))
            # might want to put this in separate function
            comm.setPause(True)
            self._printer.home("x")
        elif action_trigger == "door_closed" and self._settings.get_boolean(["action_door"]):
            self._send_client_message(action_trigger, dict(line=line))
            comm.setPause(False)
        elif action_trigger == "filament" and self._settings.get_boolean(["action_filament"]) and self.filament_action == False:
            self._on_filament_detection_during_print(comm)

    def _on_filament_detection_during_print(self, comm):
        tool = "tool%d" % comm.getCurrentTool()

        self._send_client_message("filament_action_detected", dict(tool=tool))
        comm.setPause(True)

        self.filament_detection_profile = self.filament_database.get(self._filament_query.tool == tool)["material"]
        self.filament_detection_tool_temperatures = deepcopy(self.current_temperature_data)
        self.filament_action = True

        #Will move to load position, set the tool, etc
        self._on_api_command_change_filament(tool)

        if not self.temperature_safety_timer:
            self.temperature_safety_timer_value = 900
            self.temperature_safety_timer = RepeatedTimer(1,
                                                        self._temperature_safety_tick,
                                                        run_first=False,
                                                        condition=self._temperature_safety_required,
                                                        on_condition_false=self._temperature_safety_condition)
            self.temperature_safety_timer.start()

    def _temperature_safety_tick(self):
        self.temperature_safety_timer_value -= 1
        self._send_client_message("temperature_safety", { "timer": self.temperature_safety_timer_value })

    def _temperature_safety_required(self):
        return self.temperature_safety_timer_value > 0

    def _temperature_safety_condition(self):
        """
        When temperature safety timer expires, heaters are turned off
        """
        self._printer.set_temperature("tool0", 0)
        self._printer.set_temperature("tool1", 0)
        self._printer.set_temperature("bed", 0)

    def on_printer_add_temperature(self, data):
        """
        PrinterCallback function that is called whenever a temperature is added to
        the printer interface.

        We use this call to update the tool status with the function check_tool_status()
        """

        if self.current_temperature_data == None:
            self.current_temperature_data = data
        self.old_temperature_data = deepcopy(self.current_temperature_data)
        self.current_temperature_data = data
        self.check_tool_status()

    def check_tool_status(self):
        """
        Populate a the dict tool_status with the status of the tool.
        A tool can be:
            - IDLE
            - HEATING
            - COOLING
            - READY
        """
        for tool, data in self.current_temperature_data.items():
            if tool == 'time':
                continue

            if data['target'] != self.old_temperature_data[tool]['target']:
                    # the target changed, reset the tool timer
                    self.ready_timer[tool] = self.ready_timer_default[tool]

            if self.ready_timer[tool] <= 0:
                    # not waiting for any event on this tool, we can ignore it
                    continue

            # some state vars
            heating = data['target'] > 0
            delta = data['target'] - data['actual']
            abs_delta = abs(delta)
            in_window = abs_delta <= self.temperature_window
            stable = False

            if self.ready_timer[tool]:
                    # we are waiting for a stable target temperature, check if we are in our
                    # window and if so decrease the counter. If we fall out of the window,
                    # reset the counter
                    if in_window:
                            self.ready_timer[tool] -= 1
                            if self.ready_timer[tool] <= 0:
                                    stable = True
                    else:
                            self.ready_timer[tool] = self.ready_timer_default[tool]

            # process the status
            if not heating and data["actual"] <= 35:
                   status = "IDLE"
                   text = "Idle"
                   css_class = "bg-main"
            elif stable:
                   status = "READY"
                   text = "Ready"
                   css_class = "bg-green"
            elif abs_delta > 0:
                   status = "HEATING"
                   text = "Heating"
                   css_class = "bg-orange"
            else:
                   status = "COOLING"
                   text = "Cooling"
                   css_class = "bg-yellow"

            tool_num = self._get_tool_num(tool)

            self.tool_status[tool_num]['status'] = status
            self.tool_status[tool_num]['text'] = text
            self.tool_status[tool_num]['css_class'] = css_class
            self.change_status(tool, status)
        self.send_client_tool_status()


    def change_status(self, tool, new_status):
        """
        Calls callback registered to tool change to status
        """
        if new_status == "READY":
            with self.callback_mutex:
                for callback in self.callbacks:
                    try: callback(tool)
                    except: self._logger.exception("Something went horribly wrong on reaching the target temperature")
                del self.callbacks[:]

    def heat_to_temperature(self, tool, temp, callback = None):
        """
        Heat tool up to temp and execute callback when tool is declared READY
        """
        ## Check if target temperature is same as the current target temperature
        ## and if the tool is already heated(READY), if so just run the callback
        ## This feels quite hacky so it might need to be altered. This is written to
        ## counter loading filament with the same profile deadlock.

        self._logger.debug("Heating up {tool} to {temp}".format(tool=tool, temp=temp))

        tool_num = self._get_tool_num(tool)

        if (self.current_temperature_data[tool]['target'] == temp) and (self.tool_status[tool_num]['status'] == "READY"):
            if callback:
                callback(tool)
            self.send_client_heating()
            return

        if callback:
            with self.callback_mutex:
                self.callbacks.append(callback)

        self._printer.set_temperature(tool, temp)
        self.send_client_heating()

    def _get_tool_num(self, tool):
        if tool == "bed":
            tool_num = 2
        else:
            tool_num = int(tool[len("tool"):])

        return tool_num

    ##~ Printer Control functions
    def move_to_maintenance_position(self):
        self.set_movement_mode("absolute")
        # First home X and Y
        self._printer.home(['x', 'y'])
        if self.model == "Bolt" or self.model == "Xeed":
            self._printer.commands(['G1 Z180 F1200'])
        if self.model == "Xeed":
            self._printer.commands(["G1 X115 Y15 F6000"])
        if self.model == "Xcel":
            # TODO CHECK VALUES
            self._printer.commands(['G1 Z1800 F1200'])
        self.restore_movement_mode()

    def set_movement_mode(self, mode):
        self.last_movement_mode = self.movement_mode

        if mode == "relative":
            self._printer.commands(["G91"])
        else:
            self._printer.commands(["G90"])

    def set_extrusion_mode(self, mode):
        self.last_extrusion_mode = self.extrusion_mode

        if mode == "relative":
            self._printer.commands(["M83"])
        else:
            self._printer.commands(["M82"])

    def restore_movement_mode(self):
        self.set_movement_mode(self.last_movement_mode)

    def restore_extrusion_mode(self):
        self.set_extrusion_mode(self.last_extrusion_mode)

    def restore_z_after_filament_load(self):
       if(self.z_before_filament_load is not None):
            self._printer.commands(["G1 Z%f F1200" % self.z_before_filament_load])

    def move_to_filament_load_position(self):
        self._logger.debug('move_to_filament_load_position')
        self.set_movement_mode("absolute")

        self.z_before_filament_load = self._printer._currentZ
        if self.model == 'Xeed' or self.model == 'Bolt':
            if self._printer._currentZ < 30:
                self._printer.commands(["G1 Z30 F1200"])


        if self.model == "Bolt":
            self._printer.commands(["M605 S3"]) # That reads: more awesomeness.
            self._printer.commands(["M84 S300"]) # Set stepper disable timeout to 5min
            self._printer.home(['x', 'y'])
            self._printer.commands(["G1 X1 F10000"])
            self._printer.commands(["G1 Y-33 F15000"])
            self._printer.commands(["M605 S0"])
            if self.filament_change_tool:
                self._printer.change_tool(self.filament_change_tool)
        elif self.model == "Xeed":
            self._printer.commands(["G1 X190 Y20 F6000"])
            if self.filament_change_tool:
                self._printer.change_tool(self.filament_change_tool)
        elif self.model == "Xcel":
            self._printer.commands(['G1 Z300 F1200'])
            self._printer.commands(['G1 X225 Y100 F6000'])

        self.restore_movement_mode()

    def _init_usb(self):

        # Set media folder relative to printer model
        self.media_folder = self.paths[self.model]["media"]

        # Add the LocalFileStorage to allow to browse the drive's files and folders

        try:
            self.usb_storage = octoprint_lui.util.UsbFileStorage(self.media_folder)
            octoprint.server.fileManager.add_storage("usb", self.usb_storage)
        except:
            self._logger.warning("Could not add USB storage")
            self._send_client_message("media_folder_updated", { "is_media_mounted": False, "error": True })
            return

        # Start watching the folder for changes (i.e. mounted/unmouted)
        from watchdog.observers import Observer
        observer = Observer()

        event_handler = octoprint_lui.util.CallbackFileSystemWatch(self._on_media_folder_updated)
        observer.schedule(event_handler, self.media_folder, False)
        observer.start()

        # Hit the first event in any case
        self._on_media_folder_updated(None)

    def _init_powerbutton(self):
        if self.model == "Bolt" or self.model == "Xcel":
            ## ~ Only initialise if it's not done yet.
            if not self.powerbutton_handler:
                from octoprint_lui.util.powerbutton import PowerButtonHandler
                self.powerbutton_handler = PowerButtonHandler(self._on_powerbutton_press)

    def _on_powerbutton_press(self):
        self._send_client_message("powerbutton_pressed")

    def _init_update(self):

        ##~ Update software init
        self.last_git_fetch = 0

        self.update_info = [
            {
                'name': "Leapfrog UI",
                'identifier': 'lui',
                'version': self._plugin_manager.get_plugin_info('lui').version,
                'path': '{path}OctoPrint-LUI'.format(path=self.paths[self.model]['update']),
                'update': False,
                "command": "git pull && {path}OctoPrint/venv/bin/python setup.py clean && {path}OctoPrint/venv/bin/python setup.py install".format(path=self.paths[self.model]['update'])
            },
            {
                'name': 'Network Manager',
                'identifier': 'networkmanager',
                'version': self._plugin_manager.get_plugin_info('networkmanager').version,
                'path': '{path}OctoPrint-NetworkManager'.format(path=self.paths[self.model]['update']),
                'update': False,
                "command": "git pull && {path}OctoPrint/venv/bin/python setup.py clean && {path}OctoPrint/venv/bin/python setup.py install".format(path=self.paths[self.model]['update'])
            },
            {
                'name': 'Flash Firmware Module',
                'identifier': 'flasharduino',
                'version': self._plugin_manager.get_plugin_info('flasharduino').version,
                'path': '{path}OctoPrint-flashArduino'.format(path=self.paths[self.model]['update']),
                'update': False,
                "command": "git pull && {path}OctoPrint/venv/bin/python setup.py clean && {path}OctoPrint/venv/bin/python setup.py install".format(path=self.paths[self.model]['update'])
            },
            {
                'name': 'G-code Render Module',
                'identifier': 'gcoderender',
                'version': self._plugin_manager.get_plugin_info('gcoderender').version,
                'path': '{path}OctoPrint-gcodeRender'.format(path=self.paths[self.model]['update']),
                'update': False,
                "command": "git pull && {path}OctoPrint/venv/bin/python setup.py clean && {path}OctoPrint/venv/bin/python setup.py install".format(path=self.paths[self.model]['update'])
            },
            {
                'name': 'OctoPrint',
                'identifier': 'octoprint',
                'version': VERSION,
                'path': '{path}OctoPrint'.format(path=self.paths[self.model]['update']),
                'update': False,
                "command": "git pull && {path}OctoPrint/venv/bin/python setup.py clean && {path}OctoPrint/venv/bin/python setup.py install".format(path=self.paths[self.model]['update'])
            }
        ]

        ## Commenting the auto update during start up atm to see if we can fix corrupt .git/objects
        ##self.update_info_list()
        self._logger.debug(self.update_info)


    def _add_actions(self):
        """
        Adda actions to system settings. Might be removed if
        we ship custom config file.
        """
        ## Set update actions into the settings
        ## This is a nifty function to check if a variable is in
        ## a list of dictionaries.
        def is_variable_in_dict(variable, dict):
            return any(True for x in dict if x['action'] == variable)

        actions = self._settings.global_get(["system", "actions"])

        ## Add shutdown
        if not is_variable_in_dict('shutdown', actions):
            shutdown = {
                "action": "shutdown",
                "name": "Shutdown",
                "command": "sudo shutdown -h now",
                "confirm": True
            }
            actions.append(shutdown)

        ## Add reboot
        if not is_variable_in_dict('reboot', actions):
            reboot = {
                "action": "reboot",
                "name": "Reboot",
                "command": "sudo shutdown -r now",
                "confirm": True
            }
            actions.append(reboot)

        ## Add restart service
        if not is_variable_in_dict('restart_service', actions):
            restart_service = {
                "action": "restart_service",
                "name": "Restart service",
                "command": "sudo service octoprint restart",
                "confirm": True
            }
            actions.append(restart_service)

        self._settings.global_set(["system", "actions"], actions)

    def _get_profile_from_name(self, profileName):
        profiles = self._settings.global_get(["temperature", "profiles"])
        for profile in profiles:
            if(profile['name'] == profileName):
                selectedProfile = profile

        return selectedProfile


    def _on_media_folder_updated(self, event):
        was_media_mounted = self.is_media_mounted

        # Check if there's something mounted in media_dir
        def get_immediate_subdirectories(a_dir):
            return [name for name in os.listdir(a_dir)
                if os.path.isdir(os.path.join(a_dir, name))]

        number_of_dirs = 0

        try:
            number_of_dirs = len(get_immediate_subdirectories(self.media_folder)) > 0;
        except:
            self._logger.warning("Could not read USB")
            self._send_client_message("media_folder_updated", { "is_media_mounted": False, "error": True })
            return

        if(event is None or (number_of_dirs > 0 and not was_media_mounted) or (number_of_dirs == 0 and was_media_mounted)):
            # If event is None, it's a forced message
            self._send_client_message("media_folder_updated", { "is_media_mounted": number_of_dirs > 0 })

        self.is_media_mounted = number_of_dirs > 0

        # Check if what's mounted contains a firmware (*.hex) file
        if not self.debug and not was_media_mounted and self.is_media_mounted:
            firmware = self._check_for_firmware(self.media_folder)
            if(firmware):
                firmware_file, firmware_path = firmware
                self._logger.info("Firmware file detected: %s" % firmware_file)
                file = dict()
                file["name"] = firmware_file
                file["refs"] = dict()
                file["refs"]["local_path"] = firmware_path
                self._send_client_message("firmware_update_found", { "file": file });

    def _check_for_firmware(self, path):
        result = None
        try: #TODO: Check if this has a big impact on performance
            entries = os.listdir(path)
        except:
            return result

        for entry in entries:
            entry_path = os.path.join(path, entry)

            # file handling
            if os.path.isfile(entry_path):
                file_type = octoprint.filemanager.get_file_type(entry)
                if(file_type):
                    if file_type[0] is "firmware":
                        result = { entry, entry_path }
            # folder recursion
            elif os.path.isdir(entry_path):
                result = self._check_for_firmware(entry_path)

            if result:
                return result

    def _get_firmware_info(self):
        self._printer.commands('M115')

    def _on_firmware_info_received(self, line):
        self.firmware_info_command_sent = False
        self._logger.info("M115 data received: %s" % line)
        line = line[5:].rstrip() # Strip echo and newline

        if len(line) > 0:
           self._update_from_m115_properties(line)

    def _update_from_m115_properties(self, line):
        line = line.replace(': ', ':')
        properties = dict()
        idx_end = 0

        # Loop through properties in defined order
        # TODO: account for property type
        for key in self.firmware_info_properties:
            prop = self.firmware_info_properties[key]
            proplen = len(prop)

            # Find the value position of the current property, starting at the last property's value position
            idx_start = line.find(prop, idx_end) + proplen + 1

            if idx_start > proplen:

                # Find the start of the next property
                idx_end = line.find(' ', idx_start)

                # If none found, end of value is end of line
                if idx_end == -1:
                    idx_end = len(line)

                # Substring to get value
                value = line[idx_start:idx_end]

                # For now, exception for bed_width_correction
                # TODO: Consider changing firmware (M219, M115 and EEPROM_printSettings) to work with positive value of bed_width_correction
                if key == "bed_width_correction":
                    value = -float(value)

                self._logger.info("{}: {}".format(key, value))

                self.machine_database.update({'value': value }, self._machine_query.property == key)
            else:
                self.machine_database.update({'value': 'Unknown' }, self._machine_query.property == key)


        return properties

    def _get_machine_info(self):
        machine_info = dict()
        for item in self.machine_database.all():
            machine_info.update({ item["property"] : item["value"] })

        return machine_info

    def extension_tree_hook(self):
        return dict(firmware=dict(
                    hex=octoprint.filemanager.ContentTypeMapping(["hex"], "application/octet-stream")
                ))

    ##~ OctoPrint EventHandler Plugin
    def on_event(self, event, payload, *args, **kwargs):
        if self.calibration_type:
            self._on_calibration_event(event)

        if (event == Events.PRINT_FAILED or event == Events.PRINT_CANCELLED or event == Events.PRINT_DONE or event == Events.ERROR):
            self.last_print_extrusion_amount = self.current_print_extrusion_amount
            self.current_print_extrusion_amount = [0.0, 0.0]
            self.save_filament_amount()
            self._printer.commands(["M605 S1"])
            self._printer.home(['x', 'y'])

        if (event == Events.PRINT_STARTED):
            self.current_print_extrusion_amount = [0.0, 0.0]

        if(event == Events.PRINT_STARTED or event == Events.PRINT_RESUMED):
            self.filament_action = False

        if(event == Events.CONNECTED):
            self._get_firmware_info()
            self._printer.commands(["M605 S1"])

    def _perform_service_restart(self):
        """
        Perform a restart of the octoprint service restart
        """

        self._logger.info("Restarting...")
        try:
            octoprint_lui.util.execute("sudo service octoprint restart")
        except exceptions.ScriptError as e:
            self._logger.exception("Error while restarting")
            self._logger.warn("Restart stdout:\n%s" % e.stdout)
            self._logger.warn("Restart stderr:\n%s" % e.stderr)
            raise exceptions.RestartFailed()


    ##~ Helper method that calls api defined functions
    def _call_api_method(self, command, *args, **kwargs):
        """Call the method responding to api command"""

        # Because blueprint is not protected, manually check for API key
        octoprint.server.util.apiKeyRequestHandler()

        name = "_on_api_command_{}".format(command)
        method = getattr(self, name, None)
        if method is not None and callable(method):
            return method(*args, **kwargs)


__plugin_name__ = "Leapfog UI"
def __plugin_load__():
    global __plugin_implementation__
    __plugin_implementation__ = LUIPlugin()

    global __plugin_hooks__
    __plugin_hooks__ = {
        "octoprint.comm.protocol.gcode.queuing": __plugin_implementation__.gcode_queuing_hook,
        "octoprint.comm.protocol.gcode.sent": __plugin_implementation__.gcode_sent_hook,
        "octoprint.comm.protocol.scripts": __plugin_implementation__.script_hook,
        "octoprint.comm.protocol.action": __plugin_implementation__.hook_actiontrigger,
        "octoprint.comm.protocol.gcode.received": __plugin_implementation__.gcode_received_hook,
        "octoprint.filemanager.extension_tree": __plugin_implementation__.extension_tree_hook,
    }
