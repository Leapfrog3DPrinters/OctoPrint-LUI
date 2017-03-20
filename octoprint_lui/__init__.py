# coding=utf-8
from __future__ import absolute_import

import logging
import time
import threading
import re
import subprocess
import netaddr
import os, sys, shutil, errno
import platform
import flask
import requests
import markdown
import json

from random import choice
from collections import OrderedDict
from pipes import quote
from functools import partial
from copy import deepcopy
from flask import jsonify, make_response, render_template, request
from distutils.version import StrictVersion
from distutils.dir_util import copy_tree

from tinydb import TinyDB, Query

import octoprint_lui.util

from octoprint_lui.util import exceptions
from octoprint_lui.util.firmware import FirmwareUpdateUtility

import octoprint.plugin
from octoprint.settings import settings
from octoprint.util import RepeatedTimer
from octoprint.settings import valid_boolean_trues
from octoprint.server import VERSION
from octoprint.server.util.flask import get_remote_address
from octoprint.events import Events
from octoprint_lui.util.exceptions import UpdateError

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
        self.auto_shutdown = False

        ##~ Model specific variables
        self.supported_models = ['bolt', 'xeed', 'xcel']
        self.default_model = 'bolt'
        self.model = None
        self.platform = None
        self.platform_info = None
        self.platform_info_file = None
        self.update_basefolder = None
        self.media_folder = None
        self.current_printer_profile = None
        
        ##~ Server commands
        self.systemShutdownCommand ="sudo shutdown -h now"
        self.systemRestartCommand =  "sudo shutdown -r now"
        self.serverRestartCommand = "sudo service octoprint restart"

        ##~ Filament loading variables
        self.extrusion_mode = "absolute"
        self.movement_mode = "absolute"
        self.last_movement_mode = "absolute"

        self.relative_extrusion_trigger = False
        self.current_print_extrusion_amount = [0.0, 0.0]
        self.last_print_extrusion_amount = [0.0, 0.0]
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

        self.paused_temperatures = None
        self.paused_materials = None
        self.paused_print_mode = None
        self.paused_position = None
        self.paused_filament_swap = False

        self.temperature_safety_timer = None

        self.auto_shutdown_timer = None
        self.auto_shutdown_timer_value = 0
        self.auto_shutdown_after_movie_done = False

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
            {'name': 'tool0', "status": 'IDLE', 'css_class': "bg-none"},
            {'name': 'tool1', "status": 'IDLE', 'css_class': "bg-none"},
            {'name': 'bed', "status": 'IDLE', 'css_class': "bg-none"},
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
        # If a lower version is found, user is required to update
        # Don't use any signs here. Version requirements are automatically prefixed with '>='
        self.firmware_version_requirement = { "bolt": "2.7" }
        self.firmware_info_received_hooks = []
        self.fw_version_info = None
        self.auto_firmware_update_started = False

        self.firmware_info_command_sent = False
        # Properties to be read from the firmware. Local (python) property : Firmware property. Must be in same order as in firmware!
        self.firmware_info_properties = OrderedDict()
        self.firmware_info_properties["firmware_version"] = "Leapfrog Firmware"
        self.firmware_info_properties["machine_type"] = "Model"
        self.firmware_info_properties["extruder_offset_x"] = "X"
        self.firmware_info_properties["extruder_offset_y"] = "Y"
        self.firmware_info_properties["bed_width_correction"] = "bed_width_correction"

        ##~ Usernames that cannot be removed
        self.reserved_usernames = ['local', 'bolt', 'xeed', 'xcel', 'lpfrg']
        self.local_username = 'lpfrg'

        ##~ USB and file browser
        self.is_media_mounted = False

        ##~ Calibration
        self.calibration_type = None
        self.levelbed_command_sent = False

        ##~Maintenance
        self.manual_bed_calibration_tool = None
        self.wait_for_movements_command_sent = False # Generic wait for ok after M400
        self.wait_for_maintenance_position = False # Wait for ok after M400 before aux powerdown
        self.powerdown_after_disconnect = False # Wait for disconnected event and power down aux after
        self.connecting_after_maintenance = False #Wait for connected event and notify UI after
        
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

        ##~ Changelog
        self.changelog_filename = 'CHANGELOG.md'
        self.changelog_path = None
        self.changelog_contents = []
        self.show_changelog = False
        self.plugin_version = None

        ##~ Error handling
        self.intended_disconnect = False # When true, disconnect error messages remain hidden
        self.printer_error_reason = 'unknown_printer_error' # Start with an error. This gets cleared after a succesfull connect.
        self.printer_error_extruder = None
        self.requesting_temperature_after_mintemp = False # Force another temperature poll to check if extruder is disconnected or it's just very cold
        self.send_M999_on_reconnect = False

    def initialize(self):

        #~~ get debug from yaml
        self.debug = self._settings.get_boolean(["debug_lui"])
        self.plugin_version = self._plugin_manager.get_plugin_info('lui').version

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

        ##~ Read model and prepare environment
        self.machine_info = self._get_machine_info()
        self._set_model()

        ##~ Init Update
        self._init_update()

        ##~ With model data in place, update scripts, printer profiles, users etc. if it's the first run of a new version
        self._first_run()

        ##~ Read the machine specific settings
        self._init_model()

        ##~ Now we have control over the printer, also take over control of the power button
        self._init_powerbutton()

        ##~ USB init
        self._init_usb()


        ##~ Init firmware update
        self.firmware_update_url = 'http://cloud.lpfrg.com/lui/firmwareversions.json'
        self.firmware_update_url_setting = self._settings.get(['firmware_update_url'])
        if self.debug and self.firmware_update_url_setting:
            self.firmware_update_url = self.firmware_update_url_setting
            self._logger.debug('Firmware update url overwritten with {0}'.format(self.firmware_update_url))

        self.firmware_update_info = FirmwareUpdateUtility(self.get_plugin_data_folder(), self.firmware_update_url)

        # We're delaying the auto firmware update until we have up-to-date information on the current version
        self.firmware_info_received_hooks.append(self._auto_firmware_update)

        ##~ Get filament amount stored in config
        self.update_filament_amount()

        # Changelog check
        self.changelog_path = None
        self.changelog_path = os.path.join(self.update_basefolder, 'OctoPrint-LUI', self.changelog_filename)
        self._update_changelog()

    def _set_model(self):
        """Sets the model and platform variables"""
        self.model = self.machine_info['machine_type'].lower() if 'machine_type' in self.machine_info else 'Unknown'

        if not self.model in self.supported_models:
            self._logger.warn('Model {0} not found. Defaulting to {1}'.format(self.model, self.default_model))
            self.model = self.default_model

        if sys.platform == "darwin":
            self.platform = "MacDebug"
            mac_path = os.path.expanduser("~")
            self.update_basefolder = "{mac_path}/lpfrg/".format(mac_path=mac_path)
            self.media_folder = "{mac_path}/lpfrg/GCODE/".format(mac_path=mac_path)
            self.platform_info_file = "{mac_path}/lpfrg/lpfrgplatform.json".format(mac_path=mac_path)
        elif sys.platform == "win32":
            self.platform = "WindowsDebug"
            self.update_basefolder = "C:\\Users\\erikh\\OneDrive\\Programmatuur\\"
            self.media_folder = "C:\\Tijdelijk\\usb\\"
            self.platform_info_file = "C:\\Tijdelijk\\lpfrgplatform.json"
        else:
            self.platform = "RPi"
            self.update_basefolder = "/home/pi/"
            self.media_folder = "/media/pi/"    
            self.platform_info_file = "/boot/lpfrgpi.json"

        self._logger.info("Platform: {platform}, model: {model}".format(platform=self.platform, model=self.model))

    def _first_run(self):
        """Checks if it is the first run of a new version and updates any material if necessary"""
        had_first_run_version =  self._settings.get(["had_first_run"])
        profile_dst_path = os.path.join(self._settings.global_get_basefolder("printerProfiles"), self.model.lower() + ".profile") 
        if self.debug or not had_first_run_version or StrictVersion(had_first_run_version) < StrictVersion(self.plugin_version) or not os.path.exists(profile_dst_path):
            if self.debug:
                self._logger.debug("Simulating first run for debugging.")
            elif not os.path.exists(profile_dst_path):
                self._logger.info("Printer profile not found. Simulating first run.")
            else:
                self._logger.info("First run of LUI version {0}. Updating scripts and printerprofiles.".format(self.plugin_version))

            first_run_results = []

            # Read and output information about the platform, such as the image version.
            first_run_results.append(self._output_platform_info())

            # Check OctoPrint Branch, it will reboot and first run will run again after wards. 
            # This is at the top of the first run so most things won't run twice etc.
            first_run_results.append(self._check_octoprint_branch())

            # Fix stuff on the image
            first_run_results.append(self._add_server_commands())
            first_run_results.append(self._disable_ssh())

            # Clean up caches
            first_run_results.append(self._clean_webassets())

            # Load printer specific data
            first_run_results.append(self._update_printer_scripts_profiles())
            first_run_results.append(self._configure_local_user())

            if not False in first_run_results:
                self._settings.set(["had_first_run"], self.plugin_version)
                self._settings.save()
                self._logger.info("First run completed")
            else:
                self._logger.error("First run failed")

    def _output_platform_info(self):
        self._read_platform_info()
        self._logger.info("Platform info: {0}".format(self.platform_info))
        return True

    def _read_platform_info(self):
        """ Reads the image version from /boot/lpfrgpi.json if it exists """
        if os.path.isfile(self.platform_info_file):
            try:
                with open(self.platform_info_file) as fh:    
                    data = json.load(fh)
                self.platform_info = data
            except OSError:
                self._logger.exception("Could not read platform info file")
            
    def _check_octoprint_branch(self):
        """ Check if OctoPrint branch is still on development and change it to master
            if debug mode is not on. This will install and restart service. 
            It will run _first_run again because it won't get to the saving part.
        """
        self._logger.debug('Checking branch of OctoPrint. Current branch: {0}'.format(octoprint.__branch__))
        if not self.debug and not "master" in octoprint.__branch__:
            self._logger.warning("Install is not on master branch, going to switch")
            # So we are really still on devel, let's switch to master
            checkout_master_branch = None
            try:
                checkout_master_branch = subprocess.check_output(['git', 'checkout', 'master'], cwd=self.update_info[4]["path"])
            except subprocess.CalledProcessError as err:
                self._logger.error("Can't switch branch to master: {path}. {err}".format(path=self.update_info[4]['path'], err=err))
                return False
            
            if checkout_master_branch:
                self._logger.info("Switched OctoPrint from devel to master")
                self.update_info[4]["update"] = True
                self._send_client_message("forced_update")
                self._update_plugins("OctoPrint")
        
        # Return success by default
        return True


    def _disable_ssh(self):
        if self.platform == "RPi" and not self.debug and os.path.exists("/etc/init/ssh.conf"):
            try:
                octoprint_lui.util.execute("sudo mv /etc/init/ssh.conf /etc/init/ssh.conf.disabled")
            except:
                self._logger.exception("Could not disable SSH")
                return False
        
        return True

    def _clean_webassets(self):
        """ 
        Cleans the webassets folders on first_run. Used to be a function of OctoPrint,
        but we only need it on every update. Not every startup.
        """ 

        # Ensure octoprint is not cleaning the directory every time on startup
        if self._settings.global_get_boolean(["devel", "webassets", "clean_on_startup"]):
            self._settings.global_set(["devel", "webassets", "clean_on_startup"], False)
            self._settings.save()

        # Copied from octoprint.server._setup_assets()
        has_error = False
        base_folder = self._settings.global_get_basefolder("generated")

        for entry in ("webassets", ".webassets-cache"):
            path = os.path.join(base_folder, entry)
            
            # delete path if it exists
            if os.path.isdir(path):
                try:
                    self._logger.debug("Deleting {path}...".format(path=path))
                    shutil.rmtree(path)
                except:
                    self._logger.exception("Error while trying to delete {path}, leaving it alone".format(path=path))
                    has_error = True
                    continue

            # re-create path
            self._logger.debug("Creating {path}...".format(**locals()))
            error_text = "Error while trying to re-create {path}, that might cause errors with the webassets cache".format(path=path)
            try:
                os.makedirs(path)
            except OSError as e:
                if e.errno == errno.EACCES:
                    # that might be caused by the user still having the folder open somewhere, let's try again after
                    # waiting a bit
                    import time
                    for n in range(3):
                        time.sleep(0.5)
                        self._logger.debug("Creating {path}: Retry #{retry} after {time}s".format(path=path, retry=n+1, time=(n + 1)*0.5))
                        try:
                            os.makedirs(path)
                            break
                        except:
                            if self._logger.isEnabledFor(logging.DEBUG):
                                self._logger.exception("Ignored error while creating directory {path}".format(path=path))
                            has_error = True
                            pass
                    else:
                        # this will only get executed if we never did
                        # successfully execute makedirs above
                        self._logger.exception(error_text)
                        has_error = True
                        continue
                else:
                    # not an access error, so something we don't understand
                    # went wrong -> log an error and stop
                    self._logger.exception(error_text)
                    has_error = True
                    continue
            except:
                # not an OSError, so something we don't understand
                # went wrong -> log an error and stop
                self._logger.exception(error_text)
                has_error = True
                continue

            self._logger.info("Reset webasset folder {path}...".format(path=path))

        return not has_error

    def _update_printer_scripts_profiles(self):
        """ Copies machine specific files to printerprofiles and scripts folders based on current model """
        scripts_src_folder = os.path.join(self._basefolder, "gcodes/scripts", self.model.lower())
        scripts_dst_folder = os.path.join(self._settings.global_get_basefolder("scripts"), "gcode") # copytree will check if exists and make it if necessary

        if os.path.exists(scripts_src_folder):
            try:
                copy_tree(scripts_src_folder, scripts_dst_folder)
                self._logger.debug("Scripts folder updated")
            except:
                self._logger.exception("Could not update scripts folder")
                return False
        else:
            self._logger.error("No scripts found for model {0}. Ensure the foldername is in lowercase.".format(self.model))
            return False
            
        profile_src_path = os.path.join(self._basefolder, "printerProfiles", self.model.lower() + ".profile") 
        profile_dst_path = os.path.join(self._settings.global_get_basefolder("printerProfiles"), self.model.lower() + ".profile") 
        if os.path.exists(profile_src_path):
            try:
                shutil.copyfile(profile_src_path, profile_dst_path)
                self._logger.debug("Printer profile updated")
            except:
                self._logger.exception("Could not update printer profile")
                return False
            
            self._printer._printerProfileManager.set_default(self.model.lower())
            self._printer._printerProfileManager.select(self.model.lower())
            
        else:
            self._logger.error("No printer profile found for model {0}. Ensure the filename is in lowercase.".format(self.model))
            return False
        
        # By default return success
        return True

    def _configure_local_user(self):
        """ Configures the local user which is used for autologin on the machine """
        import string

        self._settings.global_set_boolean(["accessControl", "enabled"], True)
        self._user_manager.enable()

        if not self._user_manager.findUser(self.local_username):
            local_password_chars = string.ascii_lowercase + string.ascii_uppercase + string.digits
            local_password = "".join(choice(local_password_chars) for _ in range(16))
        
            self._user_manager.addUser(self.local_username, local_password, True, ["user", "admin"], overwrite=True)

            self._settings.global_set(["accessControl", "autologinLocal"], True) 
            self._settings.global_set(["accessControl", "autologinAs"], self.local_username) 
            self._settings.save()

            self._logger.info("Local user configured with username: {0}".format(self.local_username))
        
        return True

    def _init_model(self):
        """ Reads the printer profile and any machine specific configurations """
        self.current_printer_profile = self._printer._printerProfileManager.get_current_or_default()
        self.manual_bed_calibration_positions = self.current_printer_profile["manualBedCalibrationPositions"] if "manualBedCalibrationPositions" in self.current_printer_profile else None

    ##~ Changelog
    def _update_changelog(self):
        changelog_version = self._settings.get(["changelog_version"])

        self.show_changelog = changelog_version != self.plugin_version
        
        if self.show_changelog:
            self._logger.info("LUI version changed. Reading changelog.")
            self._read_changelog_file()
         
    def _read_changelog_file(self):
        if len(self.changelog_contents) == 0:
            begin_append = False
            search = "## " + self.plugin_version
            endsearch = "## "
            if os.path.exists(self.changelog_path):
                with open(self.changelog_path, 'r') as f:
                    for line in f:   
                        if begin_append:
                            if line.startswith(endsearch):
                                break;
                            else:
                                self.changelog_contents.append(line)
                        elif line.startswith(search):
                            begin_append = True
            
            else:
                self.changelog_contents.append('Could not find changelog')
 
    def _get_changelog_html(self):
        md = os.linesep.join(self.changelog_contents)
        return markdown.markdown(md)

    ##~ Update

    def _check_version_requirement(self, current_version, requirement):
        """Helper function that checks if a given version matches a version requirement"""
        if requirement.startswith('<='):
            return StrictVersion(current_version) <= StrictVersion(requirement[2:])
        elif requirement.startswith('<'):
            return StrictVersion(current_version) < StrictVersion(requirement[1:])
        elif requirement.startswith('>='):
            return StrictVersion(current_version) >= StrictVersion(requirement[2:])
        elif requirement.startswith('>'):
            return StrictVersion(current_version) > StrictVersion(requirement[1:])
        elif requirement.startswith('=='):
            return StrictVersion(current_version) == StrictVersion(requirement[2:])
        elif requirement.startswith('='):
            return StrictVersion(current_version) == StrictVersion(requirement[1:])
        else:
            return StrictVersion(current_version) == StrictVersion(requirement)

    @octoprint.plugin.BlueprintPlugin.route("/software/changelog", methods=["GET"])
    def get_changelog(self):
        return jsonify({
            'contents': self._get_changelog_html(),
            'show_on_startup': self.show_changelog,
            'lui_version': self.plugin_version
            })

    @octoprint.plugin.BlueprintPlugin.route("/software/changelog/refresh", methods=["GET"])
    def refresh_changelog(self):
        self._read_changelog_file()
        return self.get_changelog()

    @octoprint.plugin.BlueprintPlugin.route("/firmware", methods=["GET"])
    def get_firmware_version_info(self):
        current_version = None
        version_requirement = None

        if "firmware_version" in self.machine_info and self.machine_info["firmware_version"]:
            current_version = StrictVersion(self.machine_info["firmware_version"])

        if self.model in self.firmware_version_requirement:
            version_requirement =  self.firmware_version_requirement[self.model]
                
        return jsonify({
            "current_version": str(current_version) if current_version else None,
            "version_requirement": version_requirement,
            "update_required" : self._firmware_update_required(),
            "auto_update_started": self.auto_firmware_update_started 
        })
        
    @octoprint.plugin.BlueprintPlugin.route("/firmware/update", methods=["GET"])
    def get_firmware_update_info(self):
        return jsonify(self.get_firmware_update(True))
    
    def get_firmware_update(self, forced = False):
        
        if not self.fw_version_info or forced:
            self._logger.debug("Checking online for new firmware version")
            self.fw_version_info = self.firmware_update_info.get_latest_version(self.model)

        new_firmware = False
        new_firmware_version = None
        error = False
        requires_lui_update = False

        if "firmware_version" in self.machine_info and self.machine_info["firmware_version"]:
            current_version = StrictVersion(self.machine_info["firmware_version"])
        else:
            self._logger.warn("No current firmware version stored in machine database. Faking available firmware update .")
            current_version = None

        if self.fw_version_info:
            # Compare latest with current
            self._logger.debug("Current version / latest version: {0} / {1}".format(str(current_version), self.fw_version_info["version"]))

            new_firmware_version = StrictVersion(self.fw_version_info["version"])

            if not current_version or new_firmware_version > current_version:
                new_firmware = True
                if "lui_version" in self.fw_version_info and self.fw_version_info["lui_version"]:
                    requires_lui_update = not self._check_version_requirement(self.plugin_version, self.fw_version_info["lui_version"])
                    self._logger.debug("LUI version requirement: {0}. Update required: {1}".format(self.fw_version_info["lui_version"], requires_lui_update))   
        else:
            # If there's no info found, indicate error
            error = True
     
  
        return dict({
                    "error": error, 
                    "new_firmware": new_firmware, 
                    "current_version": str(current_version) if current_version else None, 
                    "new_version": str(new_firmware_version) if new_firmware_version else None,
                    "requires_lui_update": requires_lui_update
                    })


    def _auto_firmware_update(self):
        """
        Performs an auto-update of firmware if there's a firmware version requirement that doesn't match the current firmware version.
        """
        # Only doing this once
        if self._auto_firmware_update in self.firmware_info_received_hooks:
            self.firmware_info_received_hooks.remove(self._auto_firmware_update)

        if self._firmware_update_required():
            fw_update_info = self.get_firmware_update()
        
            if fw_update_info["new_firmware"]:
                self._logger.info("New firmware required and found. Going to auto update and flash firmware.")
                
                # Notify the front-end
                self.auto_firmware_update_started = True
                self._send_client_message("auto_firmware_update_started")

                # Download the firmware update
                fw_path = None
                try:
                    fw_path = self.firmware_update_info.download_firmware(self.fw_version_info["url"])
                except:
                    self._logger.exception("Could not save firmware update. Disk full?")
                    self.auto_firmware_update_started = False
                    self._send_client_message("auto_firmware_update_failed")
                    return False

                if not fw_path:
                    self._logger.error("Could not download firmware update. Offline?")
                    self.auto_firmware_update_started = False
                    self._send_client_message("auto_firmware_update_failed")
                    return False

                # Flash the firmware update
                flashed = False
                try:
                    flashed = self.flash_firmware_update(fw_path)
                except:
                    self._logger.exception("Could not flash firmware update.")
                    self.auto_firmware_update_started = False
                    self._send_client_message("auto_firmware_update_failed")
                    return False

                if not flashed:
                    self._logger.error("Could not flash firmware update.")
                    self.auto_firmware_update_started = False
                    self._send_client_message("auto_firmware_update_failed")
                    return False
                
                self._logger.info("Auto firmware update finished.")
                self.auto_firmware_update_started = False
                self._send_client_message("auto_firmware_update_finished")

            else:
                self._logger.error("New firmware required, but no new version was found online.")
                return False
              
        # By default return success  
        return True
        

    @octoprint.plugin.BlueprintPlugin.route("/firmware/update", methods=["POST"])
    def do_firmware_update(self):
        if self.fw_version_info:
            fw_path = self.firmware_update_info.download_firmware(self.fw_version_info["url"])
            if fw_path:
                if self.flash_firmware_update(fw_path):
                    return make_response(jsonify(), 200)
                else:
                    return make_response(jsonify({ "error": "Something went wrong while flashing the firmware update"}), 400)
            else:
                return make_response(jsonify({ "error": "An error occured while downloading the firmware update" }), 400)
        else:
            return make_response(jsonify({ "error": "No firmware update available" }), 400)

    def flash_firmware_update(self, firmware_path):
        flash_plugin = self._plugin_manager.get_plugin('flasharduino')

        if flash_plugin:
            if hasattr(flash_plugin.__plugin_implementation__, 'do_flash_hex_file'):
                self.intended_disconnect = True

                board = "m2560"
                programmer = "wiring"
                port = "/dev/ttyUSB0"
                baudrate = "115200"
                ext_path = os.path.basename(firmware_path)

                return getattr(flash_plugin.__plugin_implementation__, 'do_flash_hex_file')(board, programmer, port, baudrate, firmware_path, ext_path)
            else:
                self._logger.warning("Could not flash firmware. FlashArduino plugin not up to date.")    
        else:
            self._logger.warning("Could not flash firmware. FlashArduino plugin not loaded.")

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
        self.fetching_updates = True

    def _create_update_frontend(self, update_info):
        update_frontend = []
        for update in update_info:
            update_frontend = [{'name': update['name'], 'update': update['update'], 'version': update['version']} for update in update_info]
        return update_frontend

    def _fetch_worker(self, update_info, force):
        if not octoprint_lui.util.is_online():
            # Only send a message to the front end if the user requests the update
            if force:
                self.send_client_internet_offline()
            # Return out of the worker, we can't update - not online
            self.fetching_updates = False
            return

        if not octoprint_lui.util.github_online():
            # Only send a message to the front end if the user requests the update
            if force:
                self.send_client_github_offline()
            # Return out of the worker, we can't update - not online
            self.fetching_updates = False
            return
        try:
            update_info_updated = self._update_needed_version_all(update_info)
            self.update_info = update_info_updated
        except Exception as e:
            self._logger.debug("Something went wrong in the git fetch thread: {error}".format(error= e))
            return self._send_client_message("update_fetch_error")
        finally:
            self.fetching_updates = False
            self.last_git_fetch = time.time()

        self._get_firmware_info()
        data = dict(update=self._create_update_frontend(self.update_info), machine_info=  self.machine_info)
        return self._send_client_message("update_fetch_success", data)


    def _update_needed_version_all(self, update_info):
        for update in update_info:
            update['update'] = self._is_update_needed(update['path'])
            plugin_info = self._plugin_manager.get_plugin_info(update['identifier'])
            if plugin_info:
                update['version'] = plugin_info.version
        return update_info

    def _is_update_needed(self, path):
        branch_name = None
        try:
            branch_name = subprocess.check_output(['git', 'symbolic-ref', '--short', '-q', 'HEAD'], cwd=path)
            branch_name = branch_name.strip('\n')
        except subprocess.CalledProcessError as e:
            msg = "Can't get branch for:{path}. Output: {output}".format(path=path, output = e.output)
            self._logger.warn(msg)
            raise UpdateError(msg, e)

        if branch_name:
            local = None
            remote = None

            try:
                local = subprocess.check_output(['git', 'rev-parse', branch_name], cwd=path)
                local = local.strip('\n')
            except subprocess.CalledProcessError as e:
                msg = "Git check failed for local:{path}. Message: {message}. Output: {output}".format(path=path, message = e.message, output = e.output)
                self._logger.warn(msg)
                raise UpdateError(msg, e)

            try:
                remote_r = subprocess.check_output(['git', 'ls-remote', 'origin', '-h', 'refs/heads/' + branch_name], cwd=path)
                remote_s = remote_r.split()
                if len(remote_s) > 0:
                    remote = remote_s[0]
            except subprocess.CalledProcessError as e:
                msg = "Git check failed for remote:{path}. Message: {message}. Output: {output}".format(path=path, message = e.message, output = e.output)
                self._logger.warn(msg)
                raise UpdateError(msg, e)

            if not local or not remote:
                return False ## If anything failed, at least try to pull
            else: 
                return local != remote
        else:
            return False


    def _fetch_git_repo(self, path):
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
            "changelog_version": "",
            "had_first_run": "",
            "debug_bundling" : False
        }

    def find_assets(self, rel_path, file_ext):
        result = []
        base_path = os.path.join(self.get_asset_folder(), rel_path)

        for filename in os.listdir(base_path):
            complete_path = os.path.join(base_path, filename)
            if os.path.isfile(complete_path) and filename.endswith(file_ext):
                result.append('plugin/lui/' + rel_path + '/' + filename)

        return result

    def find_minified(self, js_list):
        result = []
        base_path = self.get_asset_folder()

        for path in js_list:
            if path.startswith('plugin/lui/'):
                strippped_path = path[11:-3]
            else:
                strippped_path = path[:-3]

            full_path = os.path.join(base_path, strippped_path + '.min.js')
            new_path = path[:-3] + '.min.js'

            if os.path.exists(full_path):
                result.append(new_path)
            else:
                result.append(path)

        return result
            
                
    def create_custom_bundles(self):
        from flask_assets import Bundle
        
        debug_bundling = self._settings.get_boolean(['debug_bundling'])

        jquery_js = [
                    'plugin/lui/js/lib/jquery/jquery-2.2.4.js', 
                    'plugin/lui/js/lib/jquery/jquery.ui.widget-1.11.4.js',
                    'plugin/lui/js/lib/jquery/jquery.iframe-transport.js',
                    'plugin/lui/js/lib/jquery/jquery.fileupload-9.14.2.js',
                    'plugin/lui/js/lib/jquery/jquery.slimscroll-1.3.8.js',
                    'plugin/lui/js/lib/jquery/jquery.keyboard-1.26.14.js',
                    'plugin/lui/js/lib/jquery/jquery.overscroll-1.7.7.js'
                    ]

        lib_js = [
                    'plugin/lui/js/lib/babel-2.3.4.js',
                    'plugin/lui/js/lib/dropit-1.1.1.js',
                    'plugin/lui/js/lib/knockout-3.4.1.js',
                    'plugin/lui/js/lib/knockout.mapping-2.4.1.js',
                    'plugin/lui/js/lib/lodash-4.17.4.js',
                    'plugin/lui/js/lib/loglevel-1.4.1.js',
                    'plugin/lui/js/lib/md5-2.4.0.js',
                    'plugin/lui/js/lib/modernizr-custom-3.3.1.js',
                    'plugin/lui/js/lib/moment-2.17.1.js',
                    'plugin/lui/js/lib/moment.locales-2.17.1.js',
                    'plugin/lui/js/lib/notify-0.4.2.js',
                    'plugin/lui/js/lib/notify-lui.js',
                    'plugin/lui/js/lib/nouislider-9.2.0.js',
                    'plugin/lui/js/lib/sockjs-1.1.2.js',
                    'plugin/lui/js/lib/sprintf-1.0.3.js'
                    ]

        vm_js = self.find_assets('js/app/viewmodels', '.js')

        app_js = [
                    'plugin/lui/js/app/util/helpers.js',
                    'plugin/lui/js/app/util/dataupdate_light.js',
                    'plugin/lui/js/app/main.js'
                    ]

        css = [
                'plugin/lui/css/lui.css',
                'plugin/lui/css/font-awesome.css',
                'plugin/lui/css/notifyjs-lui.css',
                'plugin/lui/css/keyboard-lui.css',
                'plugin/lui/css/nouislider-lui.css',
                'plugin/lui/css/dropit.css'
                ]
                

        bundle_filter = "js_delimiter_bundler"
        bundle_min_filter = "rjsmin, js_delimiter_bundler"

        if self.debug and not debug_bundling:
            # Include full (debug) libraries
            lui_jquery_bundle = Bundle(*jquery_js, output="webassets/packed_lui_jquery.js", filters=bundle_filter)
            lui_lib_bundle = Bundle(*lib_js, output="webassets/packed_lui_lib.js", filters=bundle_filter)
            lui_lib_bundle = Bundle(*lib_js, output="webassets/packed_lui_lib.js", filters=bundle_filter)
        else:
            # Look for minified libraries where possible, and include them (don't minify them again)
            jquery_min_js = self.find_minified(jquery_js)
            lib_min_js = self.find_minified(lib_js)

            lui_jquery_bundle = Bundle(*jquery_min_js, output="webassets/packed_lui_jquery.js", filters=bundle_filter)
            lui_lib_bundle = Bundle(*lib_min_js, output="webassets/packed_lui_lib.js", filters=bundle_filter)
            

        # Minify viewmodel and app js files
        lui_vm_bundle = Bundle(*vm_js, output="webassets/packed_lui_vm.js", filters=bundle_min_filter)
        lui_app_bundle = Bundle(*app_js, output="webassets/packed_lui_app.js", filters=bundle_min_filter)
        lui_css_bundle = Bundle(*css, output="webassets/packed.css", filters="cssrewrite, cssmin")

        # Register bundles for use in jinja
        octoprint.server.assets.register('lui_jquery_bundle', lui_jquery_bundle)
        octoprint.server.assets.register('lui_lib_bundle', lui_lib_bundle)
        octoprint.server.assets.register('lui_vm_bundle', lui_vm_bundle)
        octoprint.server.assets.register('lui_app_bundle', lui_app_bundle)
        octoprint.server.assets.register('lui_css_bundle', lui_css_bundle)

        # In debug mode, libraries are not minified nor bundled
        # If we are debugging the bundling, we *do* want to have the libs bundled
        octoprint.server.assets.debug = self.debug and not debug_bundling

    def http_routes_hook(self, routes):
        self.create_custom_bundles()
        return []

    ##~ OctoPrint UI Plugin
    def will_handle_ui(self, request):
        return True

    def _is_request_from_localhost(self, request = None):
        remote_address = get_remote_address(request)
        localhost = netaddr.IPSet([netaddr.IPNetwork("127.0.0.0/8")])
        
        if remote_address is None:
            return True
        else:
            return netaddr.IPAddress(remote_address) in localhost

    def on_ui_render(self, now, request, render_kwargs):
        
        from_localhost = self._is_request_from_localhost(request)

        args = {
            "local_addr": from_localhost,
            "debug_lui": self.debug,
            "model": self.model,
            "printer_profile": self.current_printer_profile
        }

        args.update(render_kwargs)

        response = make_response(render_template("index_lui.jinja2", **args))

        return response

    def is_blueprint_protected(self):
        # By default, the routes to LUI are not protected. SimpleAPI calls are protected though.
        return False

    @octoprint.plugin.BlueprintPlugin.route("/webcamstream", methods=["GET"])
    def webcamstream(self):
        response = make_response(render_template("windows_lui/webcam_window_lui.jinja2", model=self.model, debug_lui=self.debug))
        return response

    def get_ui_additional_key_data_for_cache(self):
        from_localhost = self._is_request_from_localhost(request)

        return "local" if from_localhost else "remote"

    def get_ui_additional_request_data_for_preemptive_caching(self):
        return dict(environ_overrides=dict(REMOTE_ADDR=get_remote_address(request)))

    def get_ui_preemptive_caching_additional_unless(self):
        from_localhost = self._is_request_from_localhost(request)

        # Only do preemptive caching for localhost, to keep startup time to a minimum (inverse logic here because of 'unless')
        return not from_localhost

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
                'tool_status': self.tool_status,
                'auto_shutdown': self.auto_shutdown,
                'lui_version': self.plugin_version,
                'printer_error_reason': self.printer_error_reason,
                'printer_error_extruder': self.printer_error_extruder
                })
            return jsonify(result)

    def _firmware_update_required(self):
        
        if not self.model in self.firmware_version_requirement:
            self._logger.debug('No firmware version check. Model not found in version requirement.')
            return False
        elif "firmware_version" in self.machine_info:
            version_req = '>=' + str(self.firmware_version_requirement[self.model])

            if "firmware_version" in self.machine_info and self.machine_info["firmware_version"]:
                current_version = str(self.machine_info["firmware_version"])

                # _check_version_requirement is the requirement is *met*, so invert
                update_required = not self._check_version_requirement(current_version, version_req)
            
                self._logger.debug('Firmware version check. Current version: {0}. Requirement: {1}. Needs update: {2}'.format(current_version, version_req, update_required))
            else:
                self._logger.warn('Could not check firmware version, machine database not up-to-date yet.')
                update_required = False

            return update_required
        else:
            self._logger.warn('Unable to compare firmware versions. Probably firmware doesn\'t send version correctly. Requiring update.')
            return True # Unable to check, require a firmware update

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
                    move_to_head_maintenance_position = [],
                    after_head_maintenance = [],
                    move_to_bed_maintenance_position = [],
                    temperature_safety_timer_cancel = [],
                    begin_homing = [],
                    get_files = ["origin"],
                    select_usb_file = ["filename"],
                    copy_gcode_to_usb = ["filename"],
                    delete_all_uploads = [],
                    copy_timelapse_to_usb = ["filename"],
                    copy_log_to_usb = ["filename"],
                    delete_all_timelapses = [],
                    start_calibration = ["calibration_type"],
                    set_calibration_values = ["width_correction", "extruder_offset_y"],
                    restore_calibration_values = [],
                    prepare_for_calibration_position = [],
                    move_to_calibration_position = ["corner_num"],
                    restore_from_calibration_position = [],
                    start_print = ["mode"],
                    unselect_file = [],
                    auto_shutdown = ["toggle"],
                    auto_shutdown_timer_cancel = [],
                    changelog_seen = [],
                    notify_intended_disconnect = [],
                    connect_after_error = [],
                    trigger_debugging_action = [] #TODO: Remove!
            )

    def on_api_command(self, command, data):
        # Data already has command in, so only data is needed
        return self._call_api_method(**data)

    def _on_api_command_trigger_debugging_action(self, *args, **kwargs):
        """
        Allows to trigger something in the back-end. Wired to the logo on the front-end. Should be removed prior to publishing
        """
        self._printer.commands(['!!DEBUG:mintemp_error0']); # Let's the virtual printer send a MINTEMP message which brings the printer in error state

    def _on_api_command_changelog_seen(self, *args, **kwargs):
        self._logger.info("changelog_seen")
        self._settings.set(["changelog_version"], self._plugin_manager.get_plugin_info('lui').version)
        self.show_changelog = False
        self._settings.save()

    def _on_api_command_unselect_file(self):
        self._printer.unselect_file()

    def _on_api_command_auto_shutdown(self, toggle):
        self.auto_shutdown = toggle;
        self._send_client_message("auto_shutdown_toggle", dict(toggle=toggle))
        self._logger.info("Auto shutdown set to {toggle}".format(toggle=toggle))

    def _on_api_command_start_print(self, mode):
        self.set_print_mode(mode)
        self._printer.start_print()

    def _on_api_command_prepare_for_calibration_position(self):
        
        self.set_print_mode('fullcontrol')

        self.set_movement_mode("absolute")
        self._printer.home(['x', 'y', 'z'])
        self._printer.change_tool("tool1")
        self.manual_bed_calibration_tool = "tool1"
        self._printer.commands(["M84 S600"]) # Set stepper disable timeout to 10min

    def _on_api_command_move_to_calibration_position(self, corner_num):
        # TODO HERE
        corner = self.manual_bed_calibration_positions[corner_num]
        self._printer.commands(['G1 Z5 F1200'])

        if corner["mode"] == 'fullcontrol' and not self.print_mode == "fullcontrol":
            self.set_print_mode('fullcontrol')
            self._printer.home(['x'])
        elif corner["mode"] == 'mirror' and not self.print_mode == "mirror":
            self.set_print_mode('mirror')
            self._printer.home(['x'])

        if not self.manual_bed_calibration_tool or self.manual_bed_calibration_tool != corner["tool"]:
            self._printer.home(['x'])
            self._printer.change_tool(corner["tool"])
            self.manual_bed_calibration_tool = corner["tool"]

        self._printer.commands(["G1 X{} Y{} F6000".format(corner["X"],corner["Y"])])
        self._printer.commands(['G1 Z0 F1200'])

    def _on_api_command_restore_from_calibration_position(self):
        self._printer.commands(['G1 Z5 F1200'])
        self.set_print_mode('normal')
        self._printer.home(['y', 'x'])

        if self.current_printer_profile["defaultStepperTimeout"]:
            self._printer.commands(["M84 S{0}".format(self.current_printer_profile["defaultStepperTimeout"])]) # Reset stepper disable timeout
            self._printer.commands(["M84"]) # And disable them right away for now


        self.restore_movement_mode()

    def _on_api_command_start_calibration(self, calibration_type):
        self.calibration_type = calibration_type

        self._disable_timelapse()

        if calibration_type == "bed_width_small":
            calibration_src_filename = "bolt_bedwidthcalibration_100um.gcode"
        elif calibration_type == "bed_width_large":
            calibration_src_filename = "bolt_bedwidthcalibration_1mm.gcode"

        abs_path = self._copy_calibration_file(calibration_src_filename)

        if abs_path:
            self.set_print_mode('normal')
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

    #TODO: Remove?
    @octoprint.plugin.BlueprintPlugin.route("/remote_homing", methods=["GET"])
    def remote_homing(self):
        if self.debug:
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
        if self._printer.is_paused():
            self.send_client_filament_in_progress(self.paused_materials)
        else:
            self.send_client_filament_in_progress()

        # If paused, we need to restore the current parameters after the filament swap
        self.paused_filament_swap = self._printer.is_paused()

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
        context = { "filamentAction": self.filament_action,
                    "stepperTimeout": self.current_printer_profile["defaultStepperTimeout"] if "defaultStepperTimeout" in self.current_printer_profile else None,
				    "pausedFilamentSwap": self.paused_filament_swap
					}

        self.execute_printer_script("change_filament_done", context)

        if self.load_filament_timer:
            self.load_filament_timer.cancel()
        # Other wise we haven't started loading yet, so cancel the heating
        # and clear all callbacks added to the heating.
        else:
            with self.callback_mutex:
                del self.callbacks[:]
            self._restore_after_load_filament()
            self.send_client_cancelled()

        self._logger.info("Cancel change filament called with {args}, {kwargs}".format(args=args, kwargs=kwargs))

    def _on_api_command_change_filament_done(self, *args, **kwargs):
        # Still don't know if this is the best spot TODO
        if self.load_filament_timer:
            self.load_filament_timer.cancel()

        context = { "filamentAction": self.filament_action,
                    "stepperTimeout": self.current_printer_profile["defaultStepperTimeout"] if "defaultStepperTimeout" in self.current_printer_profile else None,
				    "pausedFilamentSwap": self.paused_filament_swap 
					}

        self.execute_printer_script("change_filament_done", context)

        self._restore_after_load_filament()
        self._logger.info("Change filament done called with {args}, {kwargs}".format(args=args, kwargs=kwargs))

    def _get_current_materials(self):
        """ Returns a dictionary of the currently loaded materials """
        #TODO: Fancy list comprehension stuff
        return dict({
            "tool0": self.filament_database.get(self._filament_query.tool == "tool0")["material"],
            "tool1": self.filament_database.get(self._filament_query.tool == "tool1")["material"]
                });

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

    def _on_api_command_move_to_head_maintenance_position(self, *args, **kwargs):

        self.execute_printer_script('head_maintenance_position', { "currentZ": self._printer._currentZ })
        self.wait_for_maintenance_position = True
        self._printer.commands(['M400']) #Wait for movements to complete
   
    def execute_printer_script(self, script_name, context = None):
        full_script_name = self.model.lower() + "_" + script_name + ".jinja2"
        self._logger.debug("Executing script {0}".format(full_script_name))
        self._printer.script(full_script_name, context, must_be_set = False)

    def head_in_maintenance_position(self):
        if self.powerbutton_handler:
            self.disconnect_and_powerdown() #UI is updated after power down
        else:
            self._send_client_message("head_in_maintenance_position") #Update UI straight away

    def disconnect_and_powerdown(self):
         if self.powerbutton_handler:
            self.powerdown_after_disconnect = True
            self.intended_disconnect = True
            self._printer.disconnect() 

    def do_powerdown_after_disconnect(self):
        if self.powerbutton_handler:
            self.powerbutton_handler.disableAuxPower()      
            self._logger.debug("Auxiliary power down for maintenance")
            self._send_client_message("head_in_maintenance_position")

    def power_up_after_maintenance(self):
        if self.powerbutton_handler:
            self._send_client_message("powering_up_after_maintenance")
            # Enable auxiliary power. This will fully reset the printer, so full homing is required after. 
            self.powerbutton_handler.enableAuxPower() 
            self._logger.debug("Auxiliary power up after maintenance")
            time.sleep(5) # Give it 5 sec to power up 

            #TODO: Maybe a loop with some retries instead of a 5-sec-timer?
            #TODO: Or monitor if /dev/ttyUSB0 exists?
            self.connecting_after_maintenance = True
            self._printer.connect()         

    def auto_home_after_maintenance(self):
        self.is_homed = False #Reset is_homed, so LUI waits for a G28 complete, and then sends UI update
        self._printer.home(['x','y','z'])
        
        
    def _on_api_command_after_head_maintenance(self, *args, **kwargs): 
        if self.powerbutton_handler:
            self.power_up_after_maintenance()
        else:
            self._printer.home(['x','y','z'])

    def _on_api_command_move_to_bed_maintenance_position(self, *args, **kwargs):
        self.move_to_bed_maintenance_position()

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
                self._logger.exception("Could not access the media folder", e.message)
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
            # Force clearing of the cache (not properly done by octoprint at the moment)
            if request.values.get("force", False):
                octoprint.server.api.files._clear_file_cache()
            
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

        octoprint.server.eventManager.fire(octoprint.events.Events.UPLOAD, {"file": filename, "path": filename, "target": target})

        files = {}

        #location = flask.url_for(".readGcodeFile", target=octoprint.filemanager.FileDestinations.LOCAL, filename=filename, _external=True)
        location = "/files/" + octoprint.filemanager.FileDestinations.LOCAL + "/" + str(filename)

        files.update({
            octoprint.filemanager.FileDestinations.LOCAL: {
                "name": filename,
                "path": filename,
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
            if self.platform == 'WindowsDebug':
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

    def _on_api_command_copy_log_to_usb(self, filename, *args, **kwargs):
        if not self.is_media_mounted:
            return make_response("Could not access the media folder", 400)

        # Rotated log files have also dates as extension, this check out for now. 
        # if not octoprint.util.is_allowed_file(filename, ["log"]):
        #     return make_response("Not allowed to copy this file", 400)

        logs_folder = self._settings.global_get_basefolder("logs")
        src_path = os.path.join(logs_folder, filename)

        self._copy_file_to_usb(filename, src_path, "Leapfrog-logs", "logs_copy_progress", "logs_copy_complete", "logs_copy_failed")
        

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

    def _on_api_command_auto_shutdown_timer_cancel(self):
        # User cancelled timer. So cancel the timer and send to front-end to close flyout.
        if self.auto_shutdown_timer:
            self.auto_shutdown_timer.cancel()
            self.auto_shutdown_timer = None
        self.auto_shutdown_after_movie_done = False
        self._send_client_message('auto_shutdown_timer_cancelled')

    ##~ Load and Unload methods

    def load_filament(self, tool):
        ## Only start a timer when there is none running
        if self.load_filament_timer is None:
            # Always set load_amount to 0
            self.load_amount = 0
            self.set_extrusion_mode("relative")
            load_change = None

            if self.loading_for_purging:
                self._logger.debug("load_filament for purging")
                load_initial=dict(amount=18.0, speed=2000)
                self.load_amount_stop = 2
                self.loading_for_purging = False
            else:
                self._logger.debug("load_filament")
                load_initial = self.current_printer_profile["filament"]["loadInitial"]

                if "load_change" in self.current_printer_profile["filament"]:
                    load_change = self.current_printer_profile["filament"]["loadChange"]

                self.load_amount_stop = self.current_printer_profile["filament"]["loadAmountStop"]

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
            self.unload_change = None

            unload_initial = self.current_printer_profile["filament"]["unloadInitial"]
            unload_change = None
            if "unload_change" in self.current_printer_profile["filament"]:
                unload_change = self.current_printer_profile["filament"]["unloadChange"]

            self.load_amount_stop = self.current_printer_profile["filament"]["unloadAmountStop"]
            

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
            self.load_amount_stop = self.current_printer_profile["filament"]["contLoadAmountStop"]
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
        self._restore_after_load_filament()
        self.send_client_cancelled()

    def _on_api_command_notify_intended_disconnect(self):
        self.intended_disconnect = True

    def _on_api_command_connect_after_error(self):
        self.send_M999_on_reconnect = True
        self._printer.connect()
        

    def _restore_after_load_filament(self):
        target_temp = 0
        self._logger.debug("Restoring after filament change. Filament change tool: {0}. Paused position: {1}".format(self.filament_change_tool, self.paused_position))
        
        if self.paused_filament_swap:
            # Restore temperature. Coordinates are restored by beforePrintResumed
            target_temp = self.paused_temperatures[self.filament_change_tool]["target"]

        self._printer.set_temperature(self.filament_change_tool, target_temp)

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

    def send_client_filament_in_progress(self, materials = None):
        if materials:
            self._send_client_message('filament_in_progress', { "paused_materials" : materials })
        else:
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
        """ Executes a LUI print script based on a given print/printer event """
        if not script_type == "gcode":
            return None

        # In OctoPrint itself, these scripts are also executed after the event (even though the name suggests otherwise) 
        if script_name == "beforePrintStarted":
            context = { "zOffset" : "%.2f" % -self._settings.get_float(["zoffset"]) }
            self.execute_printer_script("before_print_started", context)

        if script_name == "afterPrinterConnected":
            context = { "zOffset" : "%.2f" % -self._settings.get_float(["zoffset"]) }
            self.execute_printer_script("after_printer_connected", context)

        if script_name == "beforePrintResumed":
            self._logger.debug('Print resumed. Print mode: {0} Paused position: {1}'.format(self.paused_print_mode, self.paused_position))
            context = { "paused_position": self.paused_position, "paused_print_mode": self._print_mode_to_M605_param(self.paused_print_mode) }
            self.execute_printer_script("before_print_resumed", context)

        if script_name == "afterPrintPaused":
             self.execute_printer_script("after_print_paused")

        return None, None

    def gcode_queuing_hook(self, comm_instance, phase, cmd, cmd_type, gcode, *args, **kwargs):
        """
        Removes X0, Y0 and Z0 from G92 commands
        These commands are problamatic with different print modes.
        """
        if gcode and gcode == "G92":
            new_cmd = re.sub(' [XYZ]0', '', cmd)
            return new_cmd,


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

            elif (gcode == "M400"):
                self._process_M400(cmd)

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
        self.firmware_info_command_sent = True

    def _process_G32(self, cmd):
        self.levelbed_command_sent = True

    def _process_M400(self, cmd):
        self.wait_for_movements_command_sent = True

    def _on_movements_complete(self):
        """ 
        Fired when a M400 (wait for all movements) completes. Useful for maintenance procedures
        """
        if self.wait_for_maintenance_position:
            self.wait_for_maintenance_position = False
            self.head_in_maintenance_position()

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

        if self.levelbed_command_sent:
            if "MaxCorrectionValue" in line:
                max_correction_value = line[19:]
                self.send_client_levelbed_progress(max_correction_value)
            if "ok" in line:
                self.levelbed_command_sent = False
                self.send_client_levelbed_complete()

        if self.wait_for_movements_command_sent and "ok" in line:
            self.wait_for_movements_command_sent = False
            self._on_movements_complete()
            
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
        elif action_trigger == "filament" and self._settings.get_boolean(["action_filament"]) and \
            comm.isPrinting() and not self.filament_action:
            self._on_filament_detection_during_print(comm)

    def _on_filament_detection_during_print(self, comm):
        tool = "tool%d" % comm.getCurrentTool()

        self._send_client_message("filament_action_detected", dict(tool=tool))
        comm.setPause(True)

        self.filament_detection_profile = self.filament_database.get(self._filament_query.tool == tool)["material"]
        self.filament_detection_tool_temperatures = deepcopy(self.current_temperature_data)
        self.filament_action = True

        # Copied partly from change filament
        # Send to the front end that we are currently changing filament.
        self.send_client_filament_in_progress()
        # Set filament change tool and profile
        self.filament_change_tool = tool
        self.filament_loaded_profile = self.filament_database.get(self._filament_query.tool == tool)
        self._printer.change_tool(tool)

        self.z_before_filament_load = self._printer._currentZ
        self._printer.jog({'z': 10})
        self._printer.home(['x'])

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

        if self.requesting_temperature_after_mintemp:
            self.requesting_temperature_after_mintemp = False
            self._mintemp_temperature_received()

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
                   css_class = "bg-main"
            elif stable:
                   status = "READY"
                   css_class = "bg-green"
            elif abs_delta > 0:
                   status = "HEATING"
                   css_class = "bg-orange"
            else:
                   status = "COOLING"
                   css_class = "bg-yellow"

            tool_num = self._get_tool_num(tool)

            self.tool_status[tool_num]['status'] = status
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
    def move_to_bed_maintenance_position(self):
        self.set_movement_mode("absolute")
        self.execute_printer_script("bed_maintenance_position")
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

        context = { "currentZ": self._printer._currentZ,
                    "stepperTimeout": self.current_printer_profile["filament"]["stepperTimeout"] if "stepperTimeout" in self.current_printer_profile["filament"] else None,
                    "filamentChangeTool": self._get_tool_num(self.filament_change_tool)
                    }

        self.execute_printer_script("filament_load_position", context)

        self.restore_movement_mode()

    def _init_usb(self):
        # Add the LocalFileStorage to allow to browse the drive's files and folders

        try:
            self.usb_storage = octoprint_lui.util.UsbFileStorage(self.media_folder)
            octoprint.server.fileManager.add_storage("usb", self.usb_storage)
        except:
            self._logger.exception("Could not add USB storage")
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
        if self.platform == "RPi" and "hasPowerButton" in self.current_printer_profile and self.current_printer_profile["hasPowerButton"]:
            ## ~ Only initialise if it's not done yet.
            if not self.powerbutton_handler:
                from octoprint_lui.util.powerbutton import PowerButtonHandler
                self.powerbutton_handler = PowerButtonHandler(self._on_powerbutton_press)
        elif self.debug:
            if not self.powerbutton_handler:
                from octoprint_lui.util.powerbutton import DummyPowerButtonHandler
                self.powerbutton_handler = DummyPowerButtonHandler(self._on_powerbutton_press)

    def _on_powerbutton_press(self):
        self._send_client_message("powerbutton_pressed")

    def _init_update(self):

        ##~ Update software init
        self.last_git_fetch = 0
        self.update_info = []

        # NOTE: The order of this array is used for functions! Keep it the same! 
        self.update_info = [
            {
                'name': "Leapfrog UI",
                'identifier': 'lui',
                'version': self._plugin_manager.get_plugin_info('lui').version,
                'path': '{path}OctoPrint-LUI'.format(path=self.update_basefolder),
                'update': False,
                "command": "find .git/objects/ -type f -empty | sudo xargs rm -f && git pull origin $(git rev-parse --abbrev-ref HEAD) && {path}OctoPrint/venv/bin/python setup.py clean && {path}OctoPrint/venv/bin/python setup.py install".format(path=self.update_basefolder)
            },
            {
                'name': 'Network Manager',
                'identifier': 'networkmanager',
                'version': self._plugin_manager.get_plugin_info('networkmanager').version,
                'path': '{path}OctoPrint-NetworkManager'.format(path=self.update_basefolder),
                'update': False,
                "command": "find .git/objects/ -type f -empty | sudo xargs rm -f && git pull origin $(git rev-parse --abbrev-ref HEAD) && {path}OctoPrint/venv/bin/python setup.py clean && {path}OctoPrint/venv/bin/python setup.py install".format(path=self.update_basefolder)
            },
            {
                'name': 'Flash Firmware Module',
                'identifier': 'flasharduino',
                'version': self._plugin_manager.get_plugin_info('flasharduino').version,
                'path': '{path}OctoPrint-flashArduino'.format(path=self.update_basefolder),
                'update': False,
                "command": "find .git/objects/ -type f -empty | sudo xargs rm -f && git pull origin $(git rev-parse --abbrev-ref HEAD) && {path}OctoPrint/venv/bin/python setup.py clean && {path}OctoPrint/venv/bin/python setup.py install".format(path=self.update_basefolder)
            },
            {
                'name': 'G-code Render Module',
                'identifier': 'gcoderender',
                'version': self._plugin_manager.get_plugin_info('gcoderender').version,
                'path': '{path}OctoPrint-gcodeRender'.format(path=self.update_basefolder),
                'update': False,
                "command": "find .git/objects/ -type f -empty | sudo xargs rm -f && git pull origin $(git rev-parse --abbrev-ref HEAD) && {path}OctoPrint/venv/bin/python setup.py clean && {path}OctoPrint/venv/bin/python setup.py install".format(path=self.update_basefolder)
            },
            {
                'name': 'OctoPrint',
                'identifier': 'octoprint',
                'version': VERSION,
                'path': '{path}OctoPrint'.format(path=self.update_basefolder),
                'update': False,
                "command": "find .git/objects/ -type f -empty | sudo xargs rm -f && git pull origin $(git rev-parse --abbrev-ref HEAD) && {path}OctoPrint/venv/bin/python setup.py clean && {path}OctoPrint/venv/bin/python setup.py install".format(path=self.update_basefolder)
            }
        ]


    def _add_server_commands(self):
        """
        Adds server commands to settings. Might be removed if
        we ship custom config file.
        """
        ## Set update actions into the settings
        commands = self._settings.global_get(["server", "commands"])
        actions = self._settings.global_get(["system", "actions"])

        ## Add shutdown
        if not 'systemShutdownCommand' in commands or not commands['systemShutdownCommand']:
            self._settings.global_set(["server", "commands", "systemShutdownCommand"], self.systemShutdownCommand)
            self._logger.info("Shutdown command added")

        ## Add reboot
        if not 'systemRestartCommand' in commands or not commands['systemRestartCommand']:
            self._settings.global_set(["server", "commands", "systemRestartCommand"], self.systemRestartCommand)
            self._logger.info("Reboot command added")

        ## Add restart service
        if not 'serverRestartCommand' in commands or not commands['serverRestartCommand']:
            self._settings.global_set(["server", "commands", "serverRestartCommand"], self.serverRestartCommand)
            self._logger.info("Service restart command added")


        ## Cleanup actions
        actions_changed = False
        for index, spec in enumerate(actions):
            if spec.get("action") == 'restart_service':
                actions.pop(index)
                actions_changed = True
            
        if actions_changed:
            self._settings.global_set(["system", "actions"], actions)
            self._logger.info("Actions cleaned up")

        self._settings.save()

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
            oldModelName = self.model
            self._update_from_m115_properties(line)
            self.machine_info = self._get_machine_info()

            if not oldModelName.lower() == self.machine_info["machine_type"].lower():
                
                self.model = self.machine_info["machine_type"]
                self._logger.debug("Printer model changed. Old model: {0}. New model: {1}".format(oldModelName, self.model))

                self._init_model()
                self._update_printer_scripts_profiles()

            self._call_hooks(self.firmware_info_received_hooks)
            self._send_client_message("machine_info_updated", self.machine_info)

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

                self._logger.debug("{}: {}".format(key, value))

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

    ##~ Printer Error handling
    def _handle_error_and_disconnect(self, event, payload):
        statestring = ""
        if event == Events.DISCONNECTED and not self.intended_disconnect:
            self.printer_error_reason = 'unknown_printer_error'
            statestring = "Unintended disconnect"
            self.is_homed = False
            self.is_homing = False
        elif event == Events.ERROR:
            self.printer_error_reason = 'unknown_printer_error'
            self.is_homed = False
            self.is_homing = False
            if "error" in payload:
                statestring = payload["error"].lower()
                if "mintemp" in statestring:
                    self.printer_error_reason = 'extruder_mintemp'
                    self.printer_error_extruder = statestring[:1]
                    self._handle_mintemp()
                elif "maxtemp" in statestring:
                    self.printer_error_reason = 'extruder_maxtemp'
                    self.printer_error_extruder = statestring[:1]

        self._logger.warn('Error or disconnect. Reason: {0}. Statestring: {1}'.format(self.printer_error_reason, statestring))
        self._logger.debug('Current temperature data: {0}'.format(self.current_temperature_data))

    def _handle_mintemp(self): 
        tool = "tool" + self.printer_error_extruder
        self.requesting_temperature_after_mintemp = True
        self._printer._comm.sendCommand('M105', force=True)

    def _mintemp_temperature_received(self):
        tool = "tool" + self.printer_error_extruder
        self._logger.debug('Checking temperature for {0}'.format(tool))
        if self.current_temperature_data and tool in self.current_temperature_data:
            if self.current_temperature_data[tool]["actual"] == 0.0:
                self.printer_error_reason = 'extruder_disconnected'

        # This reason may come in late (because an M105 response is awaited first). Therefore, notify the UI
        self._send_client_message('printer_error_reason_update', { 'printer_error_reason': self.printer_error_reason, 'printer_error_extruder': self.printer_error_extruder })

    def _reset_printer_error(self):
        self._logger.debug('Clearing printer error')
        self.printer_error_reason = None
        self.printer_error_extruder = None

    def set_print_mode(self, print_mode):
        self.print_mode = print_mode
        param = self._print_mode_to_M605_param(print_mode)
        self._printer.commands(["M605 S{0}".format(param)])

    def _print_mode_to_M605_param(self, print_mode):
        if print_mode == "sync":
            return 2;
        elif print_mode == "mirror":
            return 3;
        elif print_mode == "fullcontrol":
            return 0;
        else:
            return 1;

    ##~ OctoPrint EventHandler Plugin
    def on_event(self, event, payload, *args, **kwargs):
        was_calibration = self.calibration_type
        if self.calibration_type:
            self._on_calibration_event(event)

        if (event == Events.PRINT_CANCELLED or event == Events.PRINT_DONE or event == Events.ERROR):
            self.last_print_extrusion_amount = self.current_print_extrusion_amount
            self.current_print_extrusion_amount = [0.0, 0.0]
            self.save_filament_amount()
            self.set_print_mode('normal')
            self._printer.jog({'z': 20})
            self._printer.home(['x', 'y'])

        if (event == Events.PRINT_DONE and self.auto_shutdown and not was_calibration):
            config = self._settings.global_get(["webcam", "timelapse"], merged=True)
            type = config["type"]
            self._send_client_message("auto_shutdown_start")
            # Timelapse not configured, just start the timer
            if type is None or "off" == type:
                self._logger.info("Print done, no timelapse configured and auto shutdown on. Starting shutdown timer.")
                # Start auto shutdown timer
                self._auto_shutdown_start()
            else: 
                # Timelapse is configured, let's not do anything and shutdown after render complete or failed
                self._send_client_message("auto_shutdown_wait_on_render")
                self.auto_shutdown_after_movie_done = True
                return

        if (event == Events.MOVIE_DONE and self.auto_shutdown_after_movie_done):
            # Start auto shutdown timer
            self._logger.info("Render movie Done after print done with auto shutdown. Starting shutdown.")
            self._auto_shutdown_start()

        if (event == Events.MOVIE_FAILED and self.auto_shutdown_after_movie_done):
            # Start auto shutdown timer and log that the render failed
            self._logger.warn("Render movie Failed after print done with auto shutdown. Starting shutdown.")
            self._auto_shutdown_start()

        if (event == Events.PRINT_STARTED):
            self.current_print_extrusion_amount = [0.0, 0.0]

        if(event == Events.PRINT_STARTED or event == Events.PRINT_RESUMED):
            self.filament_action = False

        if(event == Events.CONNECTING):
            self.intended_disconnect = False
            self._reset_printer_error()
        
        if(event == Events.CONNECTED):            
            if self.send_M999_on_reconnect:
                self._printer.commands(['M999'])
                self.send_M999_on_reconnect = False

            # We don't need to get the firmware info here, it's done by OctoPrint already
            # Glboal Settings -> "feature", "firmwareDetection"
            #self._get_firmware_info()
            self.set_print_mode('normal')

            if self.connecting_after_maintenance:
                self.connecting_after_maintenance = False
                self.auto_home_after_maintenance()

        if(event == Events.DISCONNECTED):
            if self.powerdown_after_disconnect:
                self.powerdown_after_disconnect = False
                self.do_powerdown_after_disconnect()

        if(event == Events.ERROR or event == Events.DISCONNECTED):
            self._handle_error_and_disconnect(event, payload)

        if(event == Events.PRINT_PAUSED):
            # Make a copy of current parameters, to be restored after a filament swap
            self.paused_temperatures = deepcopy(self.current_temperature_data)
            self.paused_materials = self._get_current_materials()
            self.paused_print_mode = self.print_mode
            self.paused_position = payload["position"] # Containts x,y,z,e,f,t(ool)

    def _auto_shutdown_start(self):
        if not self.auto_shutdown_timer:
            self.auto_shutdown_timer_value = 180 #3 Minute shutdown
            self.auto_shutdown_timer = RepeatedTimer(1,
                                                        self._auto_shutdown_tick,
                                                        run_first=False,
                                                        condition=self._auto_shutdown_required,
                                                        on_condition_false=self._auto_shutdown_condition)
            self.auto_shutdown_timer.start()

    def _auto_shutdown_tick(self):
        self.auto_shutdown_timer_value -= 1
        self._send_client_message("auto_shutdown_timer", { "timer": self.auto_shutdown_timer_value })

    def _auto_shutdown_required(self):
        return self.auto_shutdown_timer_value > 0

    def _auto_shutdown_condition(self):
        self._logger.info("Shutdown timer finished. Shutting down...")
        self._perform_sytem_shutdown()

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

    def _perform_sytem_shutdown(self):
        """
        Perform a restart of the octoprint service restart
        """

        self._logger.info("Shutting down...")
        try:
            octoprint_lui.util.execute("sudo shutdown -h now")
        except exceptions.ScriptError as e:
            self._logger.exception("Error while shutting down")
            self._logger.warn("Shutdown stdout:\n%s" % e.stdout)
            self._logger.warn("Shutdown stderr:\n%s" % e.stderr)
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

    def _call_hooks(self, hooks, *args, **kwargs):
        """ For a given list of callable hooks, executes them all with given args """
        for method in hooks:
            if callable(method):
                method(*args, **kwargs)          
    


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
        "octoprint.server.http.routes": __plugin_implementation__.http_routes_hook
    }
