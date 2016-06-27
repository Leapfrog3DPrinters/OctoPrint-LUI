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

from pipes import quote
from functools import partial
from copy import deepcopy
from flask import jsonify, make_response, render_template, request

from tinydb import TinyDB, Query 

import octoprint_lui.util

import octoprint.plugin
from octoprint.settings import settings
from octoprint.util import RepeatedTimer
from octoprint.server import VERSION
from octoprint.server.util.flask import get_remote_address


class LUIPlugin(octoprint.plugin.UiPlugin,
                octoprint.plugin.TemplatePlugin,
                octoprint.plugin.AssetPlugin,
                octoprint.plugin.SimpleApiPlugin,
                octoprint.plugin.SettingsPlugin,
                octoprint.plugin.EventHandlerPlugin,
                octoprint.printer.PrinterCallback
):

    def __init__(self):

        ##~ Global
        self.from_localhost = False
        self.debug = False

        ##~ Model specific variables
        self.model = None

        self.paths = {
            "Xeed" : {
                "update": "/home/lily/" ,
                "media": "/media/"
                },
            "Bolt" : {
                "update": "/home/pi/" ,
                "media": "/media/pi/"
            },
            "Debug" : {
                "update": "/Users/pim/lpfrg/" ,
                "media": "/Users/pim/lpfrg/GCODE/"
            },
        }

        ##~ Filament loading variables
        self.extrusion_mode = "absolute"
        self.movement_mode = "absolute"
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
        self.filament_query = None
        self.filament_database = None



        ##~ Temperature status 
        self.tool_status = {
            'tool0': 'IDLE',
            'tool1': 'IDLE',
            'bed':'IDLE'
        }
        self.old_temperature_data = None
        self.current_temperature_data = None
        self.temperature_window = 3
        self.ready_timer_default = {'tool0': 5, 'tool1': 5, 'bed': 5}
        self.ready_timer = {'tool0': 0, 'tool1': 0, 'bed': 0}
        self.callback_mutex = threading.RLock()
        self.callbacks = list()

        self.temp_before_filament_detection = { 'tool0' : 0, 'tool1' : 0 }


        ##~ Homing
        self.home_command_send = False
        self.is_homed = False
        self.is_homing = False

        ##~ Firmware
        self.firmware_info_command_sent = False
        self.firmware_info_properties = set(["machine_type", "firmware_version"])

        ##~ USB and file browser

        self.is_media_mounted = False
        #TODO: make this more pythonic
        self.browser_filter = lambda entry, entry_data: \
                                ('type' in entry_data and (entry_data["type"]=="folder" or entry_data["type"]=="machinecode")) \
                                 or octoprint.filemanager.valid_file_type(entry, type="machinecode")

        self.browser_filter_firmware = lambda entry, entry_data: \
                                ('type' in entry_data and (entry_data["type"]=="folder" or entry_data["type"]=="firmware")) \
                                 or octoprint.filemanager.valid_file_type(entry, type="firmware")

    def initialize(self):
        ##~ Model
        self.model = "Bolt"
        
        ##~ USB init
        self._init_usb()

        ##~ Init Update
        self._init_update()

        ##~ Add actions
        self._add_actions()

        #~~ Register plugin as PrinterCallback instance
        self._printer.register_callback(self)

        ##~ TinyDB
        self.filament_database_path = os.path.join(self.get_plugin_data_folder(), "filament.json")
        self.filament_database = TinyDB(self.filament_database_path)
        self.filament_query = Query()
        if self.filament_database.all() == []:
            self._logger.info("No database found creating one...")
            self.filament_database.insert_multiple({'tool':'tool'+ str(i), 'amount':0, 
                                                    'material': self.default_material} for i in range(2))
 


        ## Get filament amount stored in config
        self.update_filament_amount()

    def update_info_list(self, force=False):
        self.fetch_all_repos(force)
        for update in self.update_info:
            update['update'] = self.is_update_needed(update['path'])
            if update['identifier'] == 'lui': ## TODO
                update['version'] = self._plugin_manager.get_plugin_info(update['identifier']).version

    def fetch_all_repos(self, force):
        ##~ Make sure we only fetch if we haven't for half an hour or if we are forced
        current_time = time.time()
        if force or (current_time - self.last_git_fetch > 3600):
            self.last_git_fetch = current_time
            for update in self.update_info:
                self.fetch_git_repo(update['path'])

    def is_update_needed(self, path):
        self._logger.info(path)
        local = subprocess.check_output(['git', 'rev-parse', '@'], cwd=path)
        remote = subprocess.check_output(['git', 'rev-parse', '@{upstream}'], cwd=path)
        base = subprocess.check_output(['git', 'merge-base', '@', '@{u}'], cwd=path)

        if (local == remote):
            ##~ Remote and local are the same, git is up-to-date
            self._logger.info("Git with path: {path} is up-to-date".format(path=path))
            return False 
        elif(local == base):
            ##~ Local is behind, we need to pull
            self._logger.info("Git with path: {path} needs to be pulled".format(path=path))
            return True
        elif(remote == base):
            ##~ This should never happen and should actually call a fresh reset of the git TODO
            self._logger.info("Git with path: {path} needs to be pushed".format(path=path))
            return True


    def fetch_git_repo(self, path):
        self._logger.info(path)
        try:
            output = subprocess.check_output(['git', 'fetch'],cwd=path)
        except subprocess.CalledProcessError as err:
            self._logger.warn("Can't fetch git with path: {path}. {err}".format(path=path, err=err))
        self._logger.debug("Fetched git repo: {path}".format(path=path))

    def get_settings_defaults(self):
        return {
            "model": self.model,
            "zoffset": 0,
            "action_door": True,
            "action_filament": True,
            "firmware_info": 
                {
                    "machine_type": None,
                    "firmware_version" : None
                }
        }

    ##~ OctoPrint UI Plugin
    def will_handle_ui(self, request):
        return True

    def on_ui_render(self, now, request, render_kwargs):
        remote_address = get_remote_address(request)
        localhost = netaddr.IPSet([netaddr.IPNetwork("127.0.0.0/8")])
        if remote_address is None:
            self.from_localhost = True
        else:
            self.from_localhost = netaddr.IPAddress(remote_address) in localhost

        response = make_response(render_template("index_lui.jinja2", local_addr=self.from_localhost, model=self.model, debug_lui=self.debug, **render_kwargs))

        if remote_address is None:
            from octoprint.server.util.flask import add_non_caching_response_headers
            add_non_caching_response_headers(response)

        return response

    def get_ui_additional_key_data_for_cache(self):
        remote_address = get_remote_address(request)
        if remote_address is None:
            return

        localhost = netaddr.IPSet([netaddr.IPNetwork("127.0.0.0/8")])
        from_localhost = netaddr.IPAddress(remote_address) in localhost

        return "local" if from_localhost else "remote"

    def get_ui_additional_request_data_for_preemptive_caching(self):
        return dict(environ_overrides=dict(REMOTE_ADDR=get_remote_address(request)))

    def get_ui_additional_unless(self):
        remote_address = get_remote_address(request)
        return remote_address is None

    ##~ OctoPrint SimpleAPI Plugin  
    def on_api_get(self, request = None):
        command = None
        
        if("command" in request.values):
            command = request.values["command"]        

        if(command == "get_files"):
            return self._on_api_command_get_files(request.values["origin"])
        elif(command == "is_media_mounted"):
            return jsonify({ "is_media_mounted" : self.is_media_mounted })
        else:
            return jsonify(dict(
                update=self.update_info,
                firmware_info=self._settings.get(["firmware_info"]),
                filaments=self.filament_database.all(),
                is_homed=self.is_homed,
                is_homing=self.is_homing
                ))

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
                    update_filament = ["tool", "amount"],
                    move_to_filament_load_position = [],
                    move_to_maintenance_position = [],
                    refresh_update_info = [],
                    temperature_safety_timer_cancel = [],
                    begin_homing = [],
                    get_files = ["origin"],
                    select_usb_file = ["filename"],
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
        self._on_filament_detection_during_print(self._printer._comm)
    
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
        self.filament_loaded_profile = self.filament_database.get(self.filament_query.tool == tool)
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
            self.send_client_finished()
            return None

        profiles = self._settings.global_get(["temperature", "profiles"])
        selectedProfile = None
        
        if profileName == "filament-detection" or profileName == "filament-detection-purge": 
            # Get stored profile when filament detection was hit
            selectedProfile = self.filament_detection_profile
            temp = int(self.filament_detection_tool_temperatures[self.filament_change_tool]['target'])
        elif profileName == "purge": 
            # Select current profile
            selectedProfile = self.filament_database.get(self.filament_query.tool == self.filament_change_tool)["material"]
            temp = int(selectedProfile['extruder'])
        else: 
            # Find profile from key
            for profile in profiles: 
                if(profile['name'] == profileName):
                    selectedProfile = profile

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
        self._printer.home(['y', 'x'])
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
        self._printer.home(['y', 'x'])
        self._printer.set_temperature(self.filament_change_tool, 0.0) 
        self._logger.info("Change filament done called with {args}, {kwargs}".format(args=args, kwargs=kwargs))

    def _on_api_command_update_filament(self, *args, **kwargs):
        # Update the filament amount that is logged in tha machine
        self._logger.debug("Update filament amount called with {args}, {kwargs}".format(args=args, kwargs=kwargs))

    def _on_api_command_load_filament_cont(self, tool, direction, *args, **kwargs):
        self.load_filament_cont(tool, direction)

    def _on_api_command_load_filament_cont_stop(self, *args, **kwargs):
        if self.load_filament_timer:
            self.load_filament_timer.cancel()

    def _on_api_command_refresh_update_info(self, *args, **kwargs):
        # Force refresh update info
        self._logger.info("Refresh update info: {kwargs}".format(kwargs=kwargs))
        self.update_info_list(force=True)
        
        # Send another M115 to get the firmware version
        self._get_firmware_info()

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
                return make_response("Could access the media folder", 500)
            
            
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

            return flask.jsonify(files=files)
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

        self._logger.info("File selected: %s" % path)
        
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
        
        futureFullPath = octoprint.server.fileManager.join_path(octoprint.filemanager.FileDestinations.LOCAL, futurePath, futureFilename)
        
        def on_selected_usb_file_copy():
            percentage = (float(os.path.getsize(futureFullPath)) / float(os.path.getsize(path))) * 100.0
            self._logger.info("Copy progress: %f" % percentage)
            self._send_client_message("media_file_copy_progress", { "percentage" : percentage })
    
        is_copying = True

        def is_copying_selected_usb_file():
            return is_copying
            #return os.path.getsize(path) > os.path.getsize(futureFullPath)

        def copying_finished():
            self._send_client_message("media_file_copy_progress", { "percentage" : 0 })

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
					#"download": flask.url_for("index", _external=True) + "downloads/files/" + octoprint.filemanager.FileDestinations.LOCAL + "/" + filename
                    "download": "downloads/files/" + octoprint.filemanager.FileDestinations.LOCAL + "/" + str(filename)
				}
			}
		})
        
        r = make_response(jsonify(files=files, done=done), 201)
        r.headers["Location"] = location

        return r 

    ##~ Load and Unload methods

    def load_filament(self, tool):
      
        ## Only start a timer when there is none running
        if self.load_filament_timer is None:
            # Always set load_amount to 0
            self.load_amount = 0
           
            if self.loading_for_purging:
                self._logger.info("load_filament for purging")
                load_initial=dict(amount=16.67, speed=2000)
                load_change = None
                self.load_amount_stop = 2
                self.loading_for_purging = False
            elif self.model == "Xeed": ## Switch on model for filament loading
                self._logger.info("load_filament for Xeed")
                ## This is xeed load function, TODO: Bolt! function and switch

                # We can set one change of extrusion and speed during the timer
                # Start with load_initial and change to load_change at load_change['start']
                load_initial=dict(amount=16.67, speed=2000)
                load_change=dict(start=1900, amount=2.5, speed=300)

                # Total amount being loaded
                self.load_amount_stop = 2100
            else:
                self._logger.info("load_filament for Bolt")
                # Bolt loading
                load_initial=dict(amount=16.67, speed=2000)
                load_change = None
                self.load_amount_stop = 2

            self.set_extrusion_mode("relative")
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
            if self.model == "Xeed":
                # We can set one change of extrusion and speed during the timer
                # Start with load_initial and change to load_change at load_change['start']
                unload_initial=dict(amount= -2.5, speed=300)
                unload_change=dict(start=30, amount= -16.67, speed=2000)

                # Total amount being loaded
                self.load_amount_stop = 2100
            else:
                # Bolt stuff
                unload_initial=dict(amount= -2.5, speed=300)
                unload_change = None
                self.load_amount_stop = 45 # TODO test this
            self.set_extrusion_mode("relative")
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
            load_cont_initial = dict(amount=2.5 * direction, speed=300)
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
        self._logger.info("_load_filament_condition")

        # When loading is complete, set new loaded filament
        new_filament = {
            "amount":  self.filament_change_amount,
            "material": self.filament_change_profile
        }
        self.set_filament_profile(self.filament_change_tool, new_filament)
        self.update_filament_amount()
        self.send_client_finished()

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
        self._logger.info("_load_filament_finished")
        # Loading is finished, turn off heaters, reset load timer and back to normal movements
        self.restore_extrusion_mode()
        self.load_filament_timer = None

    def _unload_filament_finished(self):
        # Loading is finished, turn off heaters, reset load timer and back to normal movements
        self.restore_extrusion_mode()
        self.load_filament_timer = None

    def _load_filament_cont_finished(self):
        self._logger.info("_load_filament_cont_finished")
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

        self._logger.debug("Sending client message with type: {type}, and data: {data}".format(type=message_type, data=data))
        self._plugin_manager.send_plugin_message(self._identifier, dict(type=message_type, data=data))

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

    ## ~ Save helpers
    def set_filament_profile(self, tool, profile):
        self.filament_database.update(profile, self.filament_query.tool == tool)

    def get_filament_amount(self):
        filament_amount = [self.filament_database.get(self.filament_query.tool == "tool"+str(index))["amount"] for index in range(2)]
        return filament_amount

    def save_filament_amount(self):
        self.set_filament_amount("tool0")
        self.set_filament_amount("tool1")

    def update_filament_amount(self):
        self.filament_amount = self.get_filament_amount()
        self.last_send_filament_amount = deepcopy(self.filament_amount)
        self.last_saved_filament_amount = deepcopy(self.filament_amount)

    def set_filament_amount(self, tool):
        tool_num = int(tool[len("tool"):])
        self.filament_database.update({'amount': self.filament_amount[tool_num]}, self.filament_query.tool == tool)

    ## ~ Gcode script hook. Used for Z-offset Xeed
    def script_hook(self, comm, script_type, script_name):
        # The printer should get a positive number here. Altough for the user it might feel like - direction,
        # Thats how the M206 works.
        zoffset = -self._settings.get_float(["zoffset"])

        if not script_type == "gcode":
            return None
    
        if script_name == "beforePrintStarted":
            return ["M206 Z%.2f" % zoffset], None

        if script_name == "afterPrinterConnected":
            return ["M206 Z%.2f" % zoffset], None

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

            if (gcode == "M82" or gcode == "M83"):
                self._process_M82_M83(cmd)

            # Handle zero of axis 
            if gcode == "G92":
                self._process_G92(cmd)

            ##~ For now only handle extrusion when actually printing a job
            if (gcode == "G0" or gcode =="G1") and comm_instance.isPrinting():
                self._process_G0_G1(cmd, comm_instance)

            # Handle home command
            if (gcode == "G28"):
                self._process_G28(cmd)

            # Handle info command
            if (gcode == "M115"):
                self._process_M115(cmd)

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

        self._logger.info("Command: %s" % cmd)
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
        
        self._logger.info("Command: %s" % cmd)
        #self._logger.info("New movement mode: %s" % self.movement_mode)
        #self._logger.info("New extrusion mode: %s" % self.extrusion_mode)

    def _process_G92(self, cmd):
        ##~ Process a G92 command and handle zero-ing of extrusion distances
        if self.regexExtruder.search(cmd):
            self.last_extrusion = 0
            self._logger.info("Extruder zero: %s" % cmd)

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
        self.home_command_send = True
        self.is_homing = True

    def _process_M115(self, cmd):
        #self._logger.info("Command: %s" % cmd)
        self.firmware_info_command_sent = True

    def gcode_received_hook(self, comm_instance, line, *args, **kwargs):
        if self.firmware_info_command_sent:
            if "ok" in line:
                self._on_firmware_info_received(line)

        if self.home_command_send: 
            if "ok" in line:
                self.home_command_send = False
                self.is_homed = True
                self.is_homing = False
                self.send_client_is_homed()
            
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
        
        self.filament_detection_profile = self.filament_database.get(self.filament_query.tool == tool)["material"]
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
            elif stable:
                   status = "READY"
            elif delta > 0:
                   status = "HEATING"
            else:
                   status = "COOLING"

            self.tool_status[tool] = status           
            self.change_status(tool, status)

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

    def heat_to_temperature(self, tool, temp, callback):
        """
        Heat tool up to temp and execute callback when tool is declared READY
        """
        ## Check if target temperature is same as the current target temperature
        ## and if the tool is already heated(READY), if so just run the callback
        ## This feels quite hacky so it might need to be altered. This is written to 
        ## counter loading filament with the same profile deadlock.
        
        self._logger.info("Heating up {tool} to {temp}".format(tool=tool, temp=temp))

        if (self.current_temperature_data[tool]['target'] == temp) and (self.tool_status[tool] == "READY"):
            callback(tool)
            self.send_client_heating()
            return

        with self.callback_mutex:
            self.callbacks.append(callback)

        self._printer.set_temperature(tool, temp)
        self.send_client_heating()

    ##~ Printer Control functions
    def move_to_maintenance_position(self):
        self.set_movement_mode("absolute")
        # First home X and Y 
        self._printer.home(['x', 'y', 'z'])
        self._printer.commands(['G1 Z200'])
        if self.model == "Xeed":
            self._printer.commands(["G1 X115 Y15 F6000"]) 
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
        self._logger.info('move_to_filament_load_position')        
        self.set_movement_mode("absolute")
        
        self.z_before_filament_load = self._printer._currentZ
        if self._printer._currentZ < 30:
            self._printer.commands(["G1 Z30 F1200"])            

        self._printer.home(['x', 'y'])

        if self.model == "Bolt":
            self._printer.commands(["M605 S0"])
            self._printer.change_tool("tool1")
            self._printer.commands(["G1 X30 F10000"])
            self._printer.change_tool("tool0")
            self._printer.commands(["G1 X330 F10000"])
            self._printer.commands(["G1 Y1 F15000"])
            if self.filament_change_tool:
                self._printer.change_tool(self.filament_change_tool)
            self._printer.commands(["M605 S1"])
        elif self.model == "Xeed":
            self._printer.commands(["G1 X190 Y20 F6000"]) 
            if self.filament_change_tool:
                self._printer.change_tool(self.filament_change_tool)

        self.restore_movement_mode()
    
    def _init_usb(self):

        # Set media folder relative to printer model
        self.media_folder = self.paths[self.model]["media"]

        # Add the LocalFileStorage to allow to browse the drive's files and folders
        if(platform.system() == 'Windows'): # TODO: Remove this debugging feature
            self.media_folder = "D:"
        
        try:
            self.usb_storage = octoprint_lui.util.UsbFileStorage(self.media_folder)
            octoprint.server.fileManager.add_storage("usb", self.usb_storage)
        except Exception as e:
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

    def _init_update(self):

        ##~ Update software init
        self.last_git_fetch = 0
        if(platform.system() == "Windows"):
            self.update_info = []
        else:
            self.update_info = [
                {
                    'identifier': 'lui',
                    'path': '{path}OctoPrint-LUI'.format(path=self.paths[self.model]['update']),
                    'update': False,
                    'action': 'update_lui',
                    'name': "Leapfrog UI",
                    'version': "testing"
                },
                {
                    'identifier': 'networkmanager',
                    'path': '{path}OctoPrint-NetworkManager'.format(path=self.paths[self.model]['update']),
                    'update': False,
                    'action': 'update_networkmanager',
                    'name': 'Network Manager',
                    'version': "0.0.1"
                },
                {
                    'identifier': 'flasharduino',
                    'path': '{path}OctoPrint-flashArduino'.format(path=self.paths[self.model]['update']),
                    'update': False,
                    'action': 'update_flasharduino',
                    'name': 'Flash Firmware Module',
                    'version': "0.0.1"
                },      
                {
                    'identifier': 'octoprint',
                    'path': '{path}OctoPrint'.format(path=self.paths[self.model]['update']),
                    'update': False,
                    'action': 'update_octoprint',
                    'name': 'OctoPrint',
                    'version': VERSION
                }
                ]


        self.update_info_list()
        self._logger.info(self.update_info)


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

        ## Add update LUI to the actions    
        if not is_variable_in_dict('update_lui', actions):
            update_lui = {
                "action": "update_lui",
                "name": "Update LUI",
                "command": "cd {path}OctoPrint-LUI && git pull && {path}OctoPrint/venv/bin/python setup.py install".format(path=self.paths[self.model]['update']),
                "confirm": False
            }
            actions.append(update_lui)

        ## Add update network manager to the actions
        if not is_variable_in_dict('update_networkmanager', actions):
            update_networkmanager = {
                "action": "update_networkmanager",
                "name": "Update NetworkManager",
                "command": "cd {path}OctoPrint-NetworkManager && git pull && {path}OctoPrint/venv/bin/python setup.py install",
                "confirm": False
            }
            actions.append(update_networkmanager)

        ## Add update OctoPrint core to the actions
        if not is_variable_in_dict('update_octoprint', actions):
            update_octoprint = {
                "action": "update_octoprint",
                "name": "Update OctoPrint",
                "command": "cd {path}OctoPrint && git pull && {path}OctoPrint/venv/bin/python setup.py install",
                "confirm": False
            }
            actions.append(update_octoprint)

        ## Add update flasharduino to the actions
        if not is_variable_in_dict('update_flasharduino', actions):
            update_flasharduino = {
                "action": "update_flasharduino",
                "name": "Update Flash Firmware Module",
                "command": "cd {path}OctoPrint-flashArduino && git pull && {path}OctoPrint/venv/bin/python setup.py install",
                "confirm": False
            }
            actions.append(update_flasharduino)

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

        self._settings.global_set(["system", "actions"], actions)


    def _on_media_folder_updated(self, event):
        

        # Check if there's something mounted in media_dir
        def get_immediate_subdirectories(a_dir):
            return [name for name in os.listdir(a_dir)
                if os.path.isdir(os.path.join(a_dir, name))]
        
        number_of_dirs = 0
        
        try:
            number_of_dirs = len(get_immediate_subdirectories(self.media_folder)) > 0;
        except Exception as e:
            self._send_client_message("media_folder_updated", { "is_media_mounted": False, "error": True })
            return

        if(self.from_localhost): 
            if(event is None or (number_of_dirs > 0 and not self.is_media_mounted) or (number_of_dirs == 0 and self.is_media_mounted)):
                # If event is None, it's a forced message
                self._send_client_message("media_folder_updated", { "is_media_mounted": number_of_dirs > 0 })

        self.is_media_mounted = number_of_dirs > 0

        # Check if what's mounted contains a firmware (*.hex) file
        if self.is_media_mounted:
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
        entries = os.listdir(path)
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
        line = line[3:-1] # Remove ok and newline

        if len(line) > 0:
            all_firmware_info = dict(d.split(':') for d in line.split(' '))
            firmware_info = { prop: all_firmware_info[prop] for prop in self.firmware_info_properties }
        
            self._settings.set(["firmware_info"], firmware_info)
            self._settings.save()

    def extension_tree_hook(self):
        return dict(firmware=dict(
			        hex=octoprint.filemanager.ContentTypeMapping(["hex"], "application/octet-stream")
		        ))

    ##~ OctoPrint EventHandler Plugin
    def on_event(self, event, playload, *args, **kwargs):
        if (event == "PrintFailed" or event == "PrintCancelled" or event == "PrintDone" or event == "Error"):
            self.last_print_extrusion_amount = self.current_print_extrusion_amount
            self.current_print_extrusion_amount = 0.0
            self.save_filament_amount()

        if (event == "PrintStarted"):
            self.current_print_extrusion_amount = [0.0, 0.0]

        if(event == "PrintStarted" or event == "PrintResumed"):
            self.filament_action = False

        if(event == "Connected"):
            self._get_firmware_info()
            

    ##~ Helper method that calls api defined functions
    def _call_api_method(self, command, *args, **kwargs):
        """Call the method responding to api command"""
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
        "octoprint.comm.protocol.gcode.sent": __plugin_implementation__.gcode_sent_hook,
        "octoprint.comm.protocol.scripts": __plugin_implementation__.script_hook,
        "octoprint.comm.protocol.action": __plugin_implementation__.hook_actiontrigger,
        "octoprint.comm.protocol.gcode.received": __plugin_implementation__.gcode_received_hook,
        "octoprint.filemanager.extension_tree": __plugin_implementation__.extension_tree_hook,
    }
