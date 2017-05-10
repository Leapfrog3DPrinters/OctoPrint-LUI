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
from flask import jsonify, make_response, render_template, request, redirect

from distutils.version import StrictVersion
from distutils.dir_util import copy_tree

from tinydb import TinyDB, Query
from tinydb.operations import delete

import octoprint_lui.util

from octoprint_lui.util import exceptions, cloud
from octoprint_lui.util.firmware import FirmwareUpdateUtility
from octoprint_lui.util.cloud import CloudStorage, CloudConnect

import octoprint.plugin
from octoprint.settings import settings
from octoprint.util import RepeatedTimer
from octoprint.settings import valid_boolean_trues
from octoprint.server import VERSION
from octoprint.server.util.flask import get_remote_address
from octoprint.events import Events
from octoprint_lui.util.exceptions import UpdateError
from octoprint.filemanager.destinations import FileDestinations
from octoprint.plugin import BlueprintPlugin

from octoprint_lui.constants import *

class LUIPlugin(octoprint.plugin.UiPlugin,
                BlueprintPlugin,
                octoprint.plugin.SettingsPlugin,
                octoprint.plugin.EventHandlerPlugin,
                octoprint.printer.PrinterCallback,
                octoprint.plugin.ShutdownPlugin
                ):

    # Initializers

    def __init__(self):

        ##~ Global
        self.debug = False
        self.auto_shutdown = False

        ##~ Model specific
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

        ##~ Filament change
        self.extrusion_mode = ExtrusionModes.ABSOLUTE
        self.movement_mode = MovementModes.ABSOLUTE
        self.last_movement_mode = MovementModes.ABSOLUTE

        self.relative_extrusion_trigger = False
        self.loading_for_purging = False

        self.last_extrusion = 0
        self.current_extrusion = 0

        self.default_material_name = "None"

        self.regexExtruder = re.compile("(^|[^A-Za-z][Ee])(-?[0-9]*\.?[0-9]+)")
        
        self.filament_action = False

        self.load_amount = 0
        self.load_amount_stop = 0
        self.load_filament_timer = None
        self.filament_change_in_progress = False

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
        self.tool_status_stabilizing = False

        self.current_temperature_data = None
        self.temperature_window = [-6, 10] # Below, Above target temp

        # If we're in the window, but the temperature delta is greater than this value, consider the status to be 'stabilizing'
        self.instable_temperature_delta = 3 

        self.heating_callback_mutex = threading.RLock()
        self.heating_callbacks = list()

        self.print_mode = PrintModes.NORMAL

        self.tool_defaults = {
                "status":  ToolStatuses.IDLE,
                "filament_amount": 0,
                "filament_material_name": self.default_material_name,
                "last_sent_filament_amount": 0,
                "last_saved_filament_amount": 0,
                "current_print_extrusion_amount": 0
                }

        self.tools = {}

        self.filament_delta_send = 10 # The difference in filament before the client is notified
        self.filament_delta_save = 100 # The difference in filament before the database is updated

        ##~ Homing
        self.home_command_sent = False
        self.is_homed = False
        self.is_homing = False

        ##~ Firmware
        # If a lower version is found, user is required to update
        # Don't use any signs here. Version requirements are automatically prefixed with '>='
        self.firmware_version_requirement = { "bolt": "2.7.1", "xcel": "2.8.1" }
        self.firmware_info_received_hooks = []
        self.fw_version_info = None
        self.auto_firmware_update_started = False
        self.fetching_firmware_update = False
        self.virtual_m115 = "LEAPFROG_FIRMWARE:2.7.1 MACHINE_TYPE:Bolt Model:Bolt PROTOCOL_VERSION:1.0 \
                             FIRMWARE_NAME:Marlin V1 EXTRUDER_COUNT:2 EXTRUDER_OFFSET_X:0.0 EXTRUDER_OFFSET_Y:0.0 \
                             BED_WIDTH_CORRECTION:0.0"
        self.is_virtual = False

        # Properties to be read from the firmware. Local (python) property : Firmware property. Must be in same order as in firmware!
        self.firmware_info_properties = OrderedDict()
        self.firmware_info_properties["firmware_version"] = "LEAPFROG_FIRMWARE"
        self.firmware_info_properties["machine_type"] = "MACHINE_TYPE"
        self.firmware_info_properties["extruder_offset_x"] = "EXTRUDER_OFFSET_X"
        self.firmware_info_properties["extruder_offset_y"] = "EXTRUDER_OFFSET_Y"
        self.firmware_info_properties["bed_width_correction"] = "BED_WIDTH_CORRECTION"

        ##~ Usernames that cannot be removed
        self.reserved_usernames = ['local', 'bolt', 'xeed', 'xcel', 'lpfrg']
        self.local_username = 'lpfrg'

        ##~ USB and file browser
        self.is_media_mounted = False

        ##~ Calibration
        self.calibration_type = None
        self.levelbed_command_sent = False

        ##~Maintenance
        self.manual_bed_calibration_positions = None
        self.manual_bed_calibration_tool = None
        self.wait_for_movements_command_sent = False # Generic wait for ok after M400
        self.wait_for_swap_position = False # Wait for ok after M400 before aux powerdown
        self.powerdown_after_disconnect = False # Wait for disconnected event and power down aux after
        self.connecting_after_maintenance = False #Wait for connected event and notify UI after

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
        self.installing_updates = False
        self.git_lock = threading.RLock()

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

        ##~ Cloud
        self.cloud_connect = None
        self.cloud_storage = None

        self.api_exceptions = [ "plugin.lui.webcamstream", 
                                "plugin.lui.connect_to_cloud_service", 
                                "plugin.lui.connect_to_cloud_service_finished",
                                "plugin.lui.logout_cloud_service",
                                "plugin.lui.logout_cloud_service_finished"
                               ]

        ## Hostname
        self.hostname = None

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

        ##~ TinyDB - firmware
        self.machine_database_path = os.path.join(self.get_plugin_data_folder(), "machine.json")
        self.machine_database = TinyDB(self.machine_database_path)
        self._machine_query = Query() # underscore for blueprintapi compatability
        if self.machine_database.all() == []:
            self._logger.info("No machine database found creating one...")
            self.machine_database.insert_multiple({ 'property': key, 'value': '' } for key in self.firmware_info_properties.keys())

        ##~ Read model and prepare environment
        self.machine_info = self._get_machine_info()
        self._set_model()

        ##~ Read and output information about the platform, such as the image version.
        self._output_platform_info()

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
        self._update_filament_from_db()

        # Changelog check
        self.changelog_path = None
        self.changelog_path = os.path.join(self.update_basefolder, 'OctoPrint-LUI', self.changelog_filename)
        self._update_changelog()

        ##~ Cloud init
        self._init_cloud()

        ## Read hostname
        self._read_hostname()


    def _init_cloud(self):
        self.cloud_connect = CloudConnect(self._settings, self.get_plugin_data_folder())
        self.cloud_storage = CloudStorage(self.cloud_connect)
        self._file_manager.add_storage("cloud", self.cloud_storage)

    def _init_usb(self):
        # Add the LocalFileStorage to allow to browse the drive's files and folders

        try:
            self.usb_storage = octoprint_lui.util.UsbFileStorage(self.media_folder)
            octoprint.server.fileManager.add_storage("usb", self.usb_storage)
        except:
            self._logger.exception("Could not add USB storage")
            self._send_client_message(ClientMessages.MEDIA_FOLDER_UPDATED, { "isMediaMounted": False, "error": True })
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
                'forced_update': False,
                "command": "find .git/objects/ -type f -empty | sudo xargs rm -f && git pull origin $(git rev-parse --abbrev-ref HEAD) && {path}OctoPrint/venv/bin/python setup.py clean && {path}OctoPrint/venv/bin/python setup.py install".format(path=self.update_basefolder)
            },
            {
                'name': 'Network Manager',
                'identifier': 'networkmanager',
                'version': self._plugin_manager.get_plugin_info('networkmanager').version,
                'path': '{path}OctoPrint-NetworkManager'.format(path=self.update_basefolder),
                'update': False,
                'forced_update': False,
                "command": "find .git/objects/ -type f -empty | sudo xargs rm -f && git pull origin $(git rev-parse --abbrev-ref HEAD) && {path}OctoPrint/venv/bin/python setup.py clean && {path}OctoPrint/venv/bin/python setup.py install".format(path=self.update_basefolder)
            },
            {
                'name': 'Flash Firmware Module',
                'identifier': 'flasharduino',
                'version': self._plugin_manager.get_plugin_info('flasharduino').version,
                'path': '{path}OctoPrint-flashArduino'.format(path=self.update_basefolder),
                'update': False,
                'forced_update': False,
                "command": "find .git/objects/ -type f -empty | sudo xargs rm -f && git pull origin $(git rev-parse --abbrev-ref HEAD) && {path}OctoPrint/venv/bin/python setup.py clean && {path}OctoPrint/venv/bin/python setup.py install".format(path=self.update_basefolder)
            },
            {
                'name': 'G-code Render Module',
                'identifier': 'gcoderender',
                'version': self._plugin_manager.get_plugin_info('gcoderender').version,
                'path': '{path}OctoPrint-gcodeRender'.format(path=self.update_basefolder),
                'update': False,
                'forced_update': False,
                "command": "find .git/objects/ -type f -empty | sudo xargs rm -f && git pull origin $(git rev-parse --abbrev-ref HEAD) && {path}OctoPrint/venv/bin/python setup.py clean && {path}OctoPrint/venv/bin/python setup.py install".format(path=self.update_basefolder)
            },
            {
                'name': 'OctoPrint',
                'identifier': 'octoprint',
                'version': VERSION,
                'path': '{path}OctoPrint'.format(path=self.update_basefolder),
                'update': False,
                'forced_update': False,
                "command": "find .git/objects/ -type f -empty | sudo xargs rm -f && git pull origin $(git rev-parse --abbrev-ref HEAD) && {path}OctoPrint/venv/bin/python setup.py clean && {path}OctoPrint/venv/bin/python setup.py install".format(path=self.update_basefolder)
            }
        ]

    def _set_model(self):
        """Sets the model and platform variables"""
        self.model = self.machine_info['machine_type'].lower() if 'machine_type' in self.machine_info and self.machine_info['machine_type'] else 'unknown'

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

    def _init_model(self):
        """ Reads the printer profile and any machine specific configurations """
        self.current_printer_profile = self._printer._printerProfileManager.get_current_or_default()
        self.manual_bed_calibration_positions = self.current_printer_profile["manualBedCalibrationPositions"] if "manualBedCalibrationPositions" in self.current_printer_profile else None
        
        # With the profile in place, set defaults for tool-related properties

        num_extruders = self.current_printer_profile.get('extruder', {}).get('count', 1)
        has_bed = self.current_printer_profile.get('heatedBed', False)

        # Create tool0, tool1 ....
        tools = ["tool" + str(i) for i in range(num_extruders)]

        # Add bed
        if has_bed:
            tools.insert(0, "bed")

        # Override tools dict with default values
        self.tools = { tool: deepcopy(self.tool_defaults) for tool in tools }

    def _read_hostname(self):
        if self.platform == "RPi" and self.platform_info:
            image_version = StrictVersion(self.platform_info["image_version"])
            if image_version >= StrictVersion("1.2.0"):
                with open('/etc/hostname', 'r') as hostname_file:
                    try:
                        self.hostname = hostname_file.read()
                    except:
                        self._logger.exception("Could not read hostname file")

                    self._logger.info("Hostname read: {0}".format(self.hostname))


    # End initializers

    # Shutdown

    def on_shutdown(self):
        """
        Called when OctoPrint shuts down. Ensures the filament is updated with the latest information in memory.
        """
        self._save_filament_to_db()

    # End shutdown

    # First run

    def _first_run(self):
        """Checks if it is the first run of a new version and updates any material if necessary"""
        force_first_run = self._settings.get_boolean(["force_first_run"])
        had_first_run_version =  self._settings.get(["had_first_run"])

        profile_dst_path = os.path.join(self._settings.global_get_basefolder("printerProfiles"), self.model.lower() + ".profile")

        if force_first_run or not had_first_run_version or StrictVersion(had_first_run_version) < StrictVersion(self.plugin_version) or not os.path.exists(profile_dst_path):
            if force_first_run:
                self._logger.debug("Simulating first run for debugging.")
            elif not os.path.exists(profile_dst_path):
                self._logger.info("Printer profile not found. Simulating first run.")
            else:
                self._logger.info("First run of LUI version {0}. Updating scripts and printerprofiles.".format(self.plugin_version))

            first_run_results = []

            # Check OctoPrint Branch, it will reboot and first run will run again after wards.
            # This is at the top of the first run so most things won't run twice etc.
            first_run_results.append(self._check_octoprint_branch())

            # Fix stuff on the image
            first_run_results.append(self._add_server_commands())
            first_run_results.append(self._disable_ssh())
            first_run_results.append(self._set_chromium_args())

            # Clean up caches
            first_run_results.append(self._clean_webassets())

            # Load printer specific data
            first_run_results.append(self._update_printer_scripts_profiles())
            first_run_results.append(self._configure_local_user())
            first_run_results.append(self._migrate_filament_db())

            if not False in first_run_results:
                self._settings.set(["had_first_run"], self.plugin_version)
                self._settings.save()
                self._logger.info("First run completed")
            else:
                self._logger.error("First run failed")

    def _output_platform_info(self):
        """Reads and writes platform information to the logfile"""
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
            with self.git_lock:
                try:
                    checkout_master_branch = subprocess.check_output(['git', 'checkout', 'master'], cwd=self.update_info[4]["path"])
                except subprocess.CalledProcessError as err:
                    self._logger.error("Can't switch branch to master: {path}. {err}".format(path=self.update_info[4]['path'], err=err))
                    return False

                if checkout_master_branch:
                    self._logger.info("Switched OctoPrint from devel to master. Performing update later.")
                    self.update_info[4]["forced_update"] = True

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

    def _set_chromium_args(self):
        """
        Checks the command line arguments of chromium and updates them if necessary.
        Part of the first_run
        """

        required_chromium_arguments = ["--touch-events", "--disable-pinch"]

        if self.platform == "RPi" and not self.platform_info:
            # If we don't have platform_info, it means we are < image v1.1

            # Read current arguments
            chromium_startfile = "/home/pi/.config/autostart/chromium.desktop"

            if not os.path.isfile(chromium_startfile):
                self._logger.warning("Chromium file not found. Skipping update of command line arguments.")
                return True

            try:
                with open(chromium_startfile, "r") as fr:
                    chromium_startfile_contents = fr.readlines()
            except Exception as e:
                self._logger.exception("Could not read chromium file: {0}".format(e.message))
                return False

            full_line = chromium_startfile_contents[2]
            prefix = "Exec=chromium-browser "
            full_line_prefix = full_line[:len(prefix)]
            full_line_suffix = full_line[len(prefix):]
            for arg in required_chromium_arguments:
                if not arg in full_line_suffix:
                    full_line_suffix = arg + " " + full_line_suffix

            new_full_line = full_line_prefix + full_line_suffix

            if new_full_line != full_line:

                # Take ownership of the file (as we need to write to it)
                octoprint_lui.util.execute("sudo chown pi:pi {0}".format(chromium_startfile))

                # Prepare file contents
                chromium_startfile_contents[2] = new_full_line

                # Write new command line to file
                try:
                    with open(chromium_startfile, "w") as fw:
                        fw.writelines(chromium_startfile_contents)
                except Exception as e:
                    self._logger.exception("Could not write to chromium file: {0}".format(e.message))
                    return False

                self._logger.info("Chromium command line updated to: {0}".format(new_full_line))
            else:
                self._logger.info("No changes for chromium command line")
        else:
            self._logger.info("Not on old RPi image, so skipping chromium command line update")
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
            
            # Due to a typo in OctoPrint, we can't use set_default here. 
            #self._printer._printerProfileManager.set_default(self.model.lower())

            self._settings.global_set(["printerProfiles", "default"], self.model.lower())
            self._settings.save()

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

    def _migrate_filament_db(self):
        """
        Updates the filament database to match the new format, where material profiles are no longer (redundantly) stored in the db, but in the settings file.
        For each database record, the "material" property is removed, and the "material_name" property is inserted
        """
        migrated = 0

        for record in self.filament_database.all():
            if "material" in record:
                eid = record.eid
                material_name = record["material"].get("name", self.default_material_name)

                # Remove old "material" property
                self.filament_database.update(delete('material'), eids=[eid])

                # Insert new "material_name" property
                self.filament_database.update({ "material_name" : material_name }, eids=[eid])

                # Store amount 0 for default material "None"
                if material_name == self.default_material_name:
                    self.filament_database.update({ "amount" : 0 }, eids=[eid])

                migrated += 1

        self._logger.info("Filament database migration complete, migrated {0} records.".format(migrated))

        return True

    # End first run

    # Changelog

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
                                break
                            else:
                                self.changelog_contents.append(line)
                        elif line.startswith(search):
                            begin_append = True

            else:
                self.changelog_contents.append('Could not find changelog')

    def _get_changelog_html(self):
        md = os.linesep.join(self.changelog_contents)
        return markdown.markdown(md)

    # End Changelog

    # Begin API
    # TODO: These API functions need input validation and security (admin/non-admin, local/remote mostly, they are protected by API key)

	## Cloud API
    @BlueprintPlugin.route("/cloud", methods=["GET"], strict_slashes=False)
    def get_cloud_info(self):
        """
        Returns a list of available cloud services
        {
            name: string,
            friendlyName: string,
            loggedIn: string
        } 
        """
        info_obj = []
        for service in cloud.AVAILABLE_SERVICES:
            info_obj.append({ 
                "name": service,
                "friendlyName": service, #TODO: Use babel to get friendlyname
                "loggedIn": self.cloud_connect.is_logged_in(service)
                });
        return make_response(jsonify(services=info_obj))

    @BlueprintPlugin.route("/cloud/<string:service>/login", methods=["GET"])
    def connect_to_cloud_service(self, service):
        """
        Provides the redirect URL to authenticate a cloud service
        """
        auth_url = self.cloud_connect.get_auth_url(service, 'http://localhost:5000/plugin/lui/cloud/{0}/login/finished'.format(service))
        return make_response(jsonify({'auth_url' : auth_url }))
         
    @BlueprintPlugin.route("/cloud/<string:service>/login/finished", methods=["GET"])
    def connect_to_cloud_service_finished(self, service):
        """
        Redirected to by the cloud service after authentication
        """
        auth_result = self.cloud_connect.handle_auth_response(service, request)

        if not auth_result:
            self._send_client_message(ClientMessages.CLOUD_LOGIN_FAILED, { "service": service })

        return make_response("<hmtl><head></head><body><script type=\"text/javascript\">window.close()</script></body></html>")

    @BlueprintPlugin.route("/cloud/<string:service>/logout", methods=["GET"])
    def logout_cloud_service(self, service):
        """
        Provides the redirect URL to logout from a cloud service
        """
        logout_url = self.cloud_connect.get_logout_url(service, 'http://localhost:5000/plugin/lui/cloud/{0}/logout/finished'.format(service))
        return make_response(jsonify({'logout_url' : logout_url }))

    @BlueprintPlugin.route("/cloud/<string:service>/logout/finished", methods=["GET"])
    def logout_cloud_service_finished(self, service):
        """
        Redirected to by the cloud service after logging out
        """
        self.cloud_connect.handle_logout_response(service, request)
        return make_response("<hmtl><head></head><body><script type=\"text/javascript\">window.close()</script></body></html>")

	## Software API

    @BlueprintPlugin.route("/software", methods=["GET"])
    def get_updates(self):
        # Not the complete update_info array has to be send to front end
        update_frontend = self._create_update_frontend(self.update_info)

        # Only update if we passed 30 min since last fetch or if we are forced
        force = request.values.get("force", "false") in valid_boolean_trues
        current_time = time.time()
        cache_time_expired = (current_time - self.last_git_fetch) > 3600

        # First check if there's any forced update we need to execute
        # If so, return the cache of updates
        if self._perform_forced_updates():
            self._logger.debug("Performing forced updates. Not fetching.")
        elif not cache_time_expired and not force:
            self._logger.debug("Cache time of updates not expired, so not fetching updates yet")
        elif not self.fetching_updates:
            self._logger.debug("Cache time expired or forced to fetch gits. Start fetch worker.")
            self._fetch_update_info_list(force)
            return make_response(jsonify(status="fetching", update=update_frontend, machine_info=self.machine_info), 200)

        # By default return the cache
        return make_response(jsonify(status="cache", update=update_frontend, machine_info=self.machine_info), 200)

    @BlueprintPlugin.route("/software/update", methods=["POST"])
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
                return make_response(jsonify({ "message": "Failed to start update of plugin: {plugin}. Not installed.".format(plugin=plugin) }), 400)
            self._logger.debug("Starting update of {plugin}".format(plugin=plugin))
            # Send updating to front end
            self._update_plugins(plugin)
            return make_response(jsonify(status="updating", text="Starting update of {plugin}".format(plugin=plugin)), 200)

        else:
            # We didn't get a plugin, should never happen
            self._logger.debug("No plugin given! Can't update that.")
            return make_response(jsonify({ "message": "No plugin given, can't update"}), 400)

    @BlueprintPlugin.route("/software/changelog/seen", methods=["POST"])
    def changelog_seen(self):
        """
        Records that the changelog has been seen by the user, so it won't appear on startup again
        """
        
        self._logger.debug("changelog_seen")
        self._settings.set(["changelog_version"], self._plugin_manager.get_plugin_info('lui').version)
        self.show_changelog = False
        self._settings.save()

        return make_response(jsonify(), 200);

    @BlueprintPlugin.route("/software/changelog", methods=["GET"])
    def get_changelog(self):
        """
        Gets whether the changelog needs to be shown on startup. If so, also includes the contents.
        """
        return jsonify({
            'contents': self._get_changelog_html(),
            'show_on_startup': self.show_changelog,
            'lui_version': self.plugin_version
            })

    @BlueprintPlugin.route("/software/changelog/refresh", methods=["GET"])
    def refresh_changelog(self):
        """
        Forces to re-read and parse the changelog. Retuns the contents of the changelog
        """
        self._read_changelog_file()
        return self.get_changelog()

    ## Firmware API

    @BlueprintPlugin.route("/firmware", methods=["GET"])
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

    @BlueprintPlugin.route("/firmware/update", methods=["POST"])
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

    @BlueprintPlugin.route("/firmware/update", methods=["GET"], strict_slashes=False)
    @BlueprintPlugin.route("/firmware/update/<string:silent>", methods=["GET"], strict_slashes=False)
    def get_firmware_update_info(self, silent = ''):
        """
        Starts a thread that fetches firmware updates. A socket message is sent whenever the process completes
        """
        if self.fetching_firmware_update:
            self._logger.debug("Firmware fetch thread already started. Not spawning another one.")
            return make_response(jsonify(), 400)
        else:
            self.fetching_firmware_update = True
            self._logger.debug("Starting firmware fetch thread")
            firmware_fetch_thread = threading.Thread(target=self._notify_firmware_update, args=(bool(silent),))
            firmware_fetch_thread.daemon = False
            firmware_fetch_thread.start()

            return make_response(jsonify(), 200)

    ## Settings API

    @BlueprintPlugin.route("/settings", methods=["GET"])
    def get_settings(self):
        """
        Returns a stripped down version of the OctoPrint settings, extended with the current autoshutdown setting.
        """
        s = self._settings

        data = {
            "appearance": {
                "name": s.global_get(["appearance", "name"]),
                "defaultLanguage": s.global_get(["appearance", "defaultLanguage"])
            },
            "feature": {
                "modelSizeDetection": s.global_get_boolean(["feature", "modelSizeDetection"]),
            },
            "serial": {
                "autoconnect": s.global_get_boolean(["serial", "autoconnect"]),
                "log": s.global_get_boolean(["serial", "log"]),
            },
            "temperature": {
                "profiles": s.global_get(["temperature", "profiles"]),
                "cutoff": s.global_get_int(["temperature", "cutoff"])
            },
            "terminalFilters": s.global_get(["terminalFilters"]),
            "server": {
                "diskspace": {
                    "warning": s.global_get_int(["server", "diskspace", "warning"]),
                    "critical": s.global_get_int(["server", "diskspace", "critical"])
                }
            },
            "plugins": {
                "lui": {
                    "actionDoor": s.getBoolean(["action_door"]),
                    "actionFilament": s.getBoolean(["action_filament"]),
                    "zoffset": s.getFloat(["zoffset"]),
                    "autoShutdown": self.auto_shutdown,
                }
            }
        }

        return make_response(jsonify(data), 200)

    ## Maintenance API

    @BlueprintPlugin.route("/maintenance/bed/clean/start", methods=["POST"])
    def maintenance_bed_clean_start(self):
        """
        Moves bed to cleaning position
        """
        self._move_to_bed_maintenance_position()
        return make_response(jsonify(), 200)

    @BlueprintPlugin.route("/maintenance/bed/clean/finish", methods=["POST"])
    def maintenance_bed_clean_finish(self):
        """
        Homes after clean bed position
        """
        self._printer.home(['x', 'y'])
        return make_response(jsonify(), 200)

    @BlueprintPlugin.route("/maintenance/bed/calibrate/start", methods=["POST"])
    def calibration_bed_start(self):
        """
        Starts the bed calibration procedure by preparing the printer for the calibration
        """
        self._set_print_mode(PrintModes.FULL_CONTROL)

        self._set_movement_mode("absolute")
        self._printer.home(['x', 'y', 'z'])
        self._printer.change_tool("tool1")
        self.manual_bed_calibration_tool = "tool1"
        self._printer.commands(["M84 S600"]) # Set stepper disable timeout to 10min
        return make_response(jsonify(), 200)

    @BlueprintPlugin.route("/maintenance/bed/calibrate/move_to_position/<string:corner_name>", methods=["POST"])
    def calibration_bed_move_to_position(self, corner_name):
        """
        Moves the heads to the given corners
        """
        corner = self.manual_bed_calibration_positions[corner_name]
        self._printer.commands(['G1 Z5 F600'])

        if corner["mode"] == 'fullcontrol' and not self.print_mode == PrintModes.FULL_CONTROL:
            self._set_print_mode(PrintModes.FULL_CONTROL)
            self._printer.home(['x'])
        elif corner["mode"] == 'mirror' and not self.print_mode == PrintModes.MIRROR:
            self._set_print_mode(PrintModes.MIRROR)
            self._printer.home(['x'])

        if not self.manual_bed_calibration_tool or self.manual_bed_calibration_tool != corner["tool"]:
            self._printer.home(['x'])
            self._printer.change_tool(corner["tool"])
            self.manual_bed_calibration_tool = corner["tool"]

        self._printer.commands(["G1 X{} Y{} F6000".format(corner["X"],corner["Y"])])
        self._printer.commands(['G1 Z0 F600'])
        return make_response(jsonify(), 200)

    @BlueprintPlugin.route("/maintenance/bed/calibrate/finish", methods=["POST"])
    def calibration_bed_finish(self):
        """
        Finishes the bed calibration by homing the x and y axis
        """
        self._printer.commands(['G1 Z5 F600'])
        self._set_print_mode(PrintModes.NORMAL)
        self._printer.home(['y', 'x'])

        if self.current_printer_profile["defaultStepperTimeout"]:
            self._printer.commands(["M84 S{0}".format(self.current_printer_profile["defaultStepperTimeout"])]) # Reset stepper disable timeout
            self._printer.commands(["M84"]) # And disable them right away for now


        self.restore_movement_mode()
        return make_response(jsonify(), 200)

    @BlueprintPlugin.route("/maintenance/head/start", methods=["POST"])
    def maintenance_head_start(self):
        """
        Moves to the filament load position
        """
        self._execute_printer_script('filament_load_position', { "filamentChangeTool": None, "currentZ": self._printer._currentZ })
        return make_response(jsonify(), 200)

    @BlueprintPlugin.route("/maintenance/head/finish", methods=["POST"])
    def maintenance_head_finish(self):
        """
        Homes the printer
        """
        self._printer.home(['x', 'y'])
        return make_response(jsonify(), 200)

    @BlueprintPlugin.route("/maintenance/head/swap/start", methods=["POST"])
    def maintenance_swap_head_start(self):
        """
        Moves heads to maintenance position
        """
        self._execute_printer_script('head_swap_position', { "currentZ": self._printer._currentZ })
        self.wait_for_swap_position = True
        self._printer.commands(['M400']) #Wait for movements to complete
        return make_response(jsonify(), 200)

    @BlueprintPlugin.route("/maintenance/head/swap/finish", methods=["POST"])
    def maintenance_head_swap_finish(self):
        if self.powerbutton_handler:
            self._power_up_after_maintenance()
        else:
            self._auto_home_after_maintenance()

        return make_response(jsonify(), 200)

    @BlueprintPlugin.route("/maintenance/head/calibrate/start/<string:calibration_type>", methods=["POST"])
    def calibration_head_start(self, calibration_type):
        """
        Starts the calibration of the extruders, calibration_type gives which calibration step 
        """
        self.calibration_type = calibration_type

        self._disable_timelapse()

        if calibration_type == "bed_width_small":
            calibration_src_filename = "bolt_bedwidthcalibration_100um.gcode"
        elif calibration_type == "bed_width_large":
            calibration_src_filename = "bolt_bedwidthcalibration_1mm.gcode"

        abs_path = self._copy_calibration_file(calibration_src_filename)

        if abs_path:
            self._set_print_mode(PrintModes.NORMAL)
            self._preheat_for_calibration()
            self._printer.select_file(abs_path, False, True)
        return make_response(jsonify(), 200)

    @BlueprintPlugin.route("/maintenance/head/calibrate/set_values", methods=["POST"])
    def calibration_head_set_values(self):
        """
        Sets the calibration values in the firmware
        """
        data = request.json
        width_correction = data.get("width_correction")
        extruder_offset_y = data.get("extruder_offset_y")
        persist = data.get("persist")

        self._logger.debug("Setting {0} calibration values: {1}, {2}".format("persisting" if persist else "non-persisting",width_correction, extruder_offset_y))

        #TODO: Consider changing firmware to accept positive value for S (M115, M219 and EEPROM_printSettings)
        self._printer.commands("M219 S%f" % -width_correction)
        self._printer.commands("M50 Y%f" % extruder_offset_y)

        if persist:
            # Store settings and read back from machine
            self._printer._comm.sendCommand("M500", on_sent = self._get_firmware_info)
        else:
            # Read the settings back from the machine
            self._get_firmware_info()
        return make_response(jsonify(), 200)

    @BlueprintPlugin.route("/maintenance/head/calibrate/restore_values", methods=["POST"])
    def calibration_head_restore_values(self):
        """
        Requests the values from the firmware
        """
        # Read back from machine (which may constrain the correction value)
        # We don't want the M501 response to interferere with the M115, which is why on_sent is used (which requires an acknowledge)
        self._printer._comm.sendCommand("M501", on_sent = self._get_firmware_info)
        return make_response(jsonify(), 200)

    ## Filament API

    @BlueprintPlugin.route("/filament", methods=["GET"])
    def get_filament(self):
        """
        Returns a JSON response with the currently loaded filaments per tool
        """
        return make_response(jsonify({ "filaments": self._get_current_filaments() }), 200)

    @BlueprintPlugin.route("/filament/<string:tool>", methods=["POST"])
    def set_filament(self, tool):
        """
        Overrides the currently loaded filament materials and amounts
        """
        data = request.json
        amount = data.get("amount", 0)
        material_name = data.get("materialProfileName")
        
        material = self._get_material_from_name(material_name)
        
        if not material or material["name"] == self.default_material_name:
            self.tools[tool]["filament_amount"] = 0
            self.tools[tool]["filament_material_name"] = self.default_material_name
        else:
            self.tools[tool]["filament_amount"] = amount
            self.tools[tool]["filament_material_name"] = material["name"]

        self._save_filament_to_db(tool)
        self.send_client_filament_amount()

        return make_response(jsonify(), 200)

    @BlueprintPlugin.route("/filament/<string:tool>/heat/start", methods=["POST"])
    def heat_filament_start(self, tool):
        """ 
        Begins heating of the given tool to the temperature of the currently loaded material
        """

        # Find the material that is loaded in this tool
        material = self._get_material_from_name(self.tools[tool]["filament_material_name"])

        if not material:
            return make_response(jsonify({ "message": "Material not found."}), 400) 

        if material["name"] == self.default_material_name:
            return make_response(jsonify({ "message": "Cannot preheat if no material is loaded."}), 400) 

        # Start heating to the temperature
        temp = int(material['extruder'])
        self.heat_to_temperature(tool, temp)

        return make_response(jsonify(), 200) 

    @BlueprintPlugin.route("/filament/<string:tool>/heat/finish", methods=["POST"])
    def heat_filament_finish(self, tool):
        """ 
        Stops heating of the given tool
        """
        # Stop purging if it is doing that at the moment
        if self.load_filament_timer:
            self.load_filament_timer.cancel()

        self.heat_to_temperature(tool, 0)

        return make_response(jsonify(), 200) 

    @BlueprintPlugin.route("/filament/<string:tool>/change/start", methods=["POST"])
    def change_filament_start(self, tool):
        """
        Starts the change filament procedure, by setting the state variables server side and initiating the filament unload sequence. 
        """
        # Send to the front end that we are currently changing filament.
        if self._printer.is_paused():
            self._send_client_message(ClientMessages.FILAMENT_CHANGE_STARTED, { "paused_materials": self.paused_materials })
        else:
            self._send_client_message(ClientMessages.FILAMENT_CHANGE_STARTED)

        # If paused, we need to restore the current parameters after the filament swap
        self.paused_filament_swap = self._printer.is_paused()

        # Set filament change tool
        self._printer.change_tool(tool)

        # Move to change filament position
        self.move_to_filament_load_position(tool)

        # Check if filament is loaded, if so report to front end.
        self._logger.debug(str(self.tools))
        material = self._get_material_from_name(self.tools[tool]["filament_material_name"])
        if not material or material['name'] == self.default_material_name:
            # No filament is loaded in this tool, directly continue to load section
            self._send_client_message(ClientMessages.FILAMENT_CHANGE_UNLOAD_FINISHED)

        self._logger.info("Start change filament called with tool: {tool}, material: {material}".format(tool=tool, material=material['name'] if material else self.default_material_name))
        return make_response(jsonify(), 200)

    @BlueprintPlugin.route("/filament/<string:tool>/change/unload", methods=["POST"])
    def change_filament_unload(self, tool):
        """
        The first step after starting the filament change procedure:
        preheats and unloads the filament from the extruder
        """
        # Determine the material that is currently loaded
        material = self._get_material_from_name(self.tools[tool]["filament_material_name"])

        if not material or material['name'] == self.default_material_name:
            self._logger.warning("Tried to unload while no material is loaded.")
            return make_response(jsonify(message="Tried to unload while no material is loaded."), 400)

        # Heat to material temperature, and afterwards begin unloading
        self.heat_to_temperature(tool,
                                material["extruder"],
                                self._unload_filament)

        self._logger.debug("Unload filament called")
        return make_response(jsonify(), 200)

    @BlueprintPlugin.route("/filament/<string:tool>/change/load", methods=["POST"])
    def change_filament_load(self, tool):
        """
        Preheats and loads the filament into the extruder.
        Request: { loadFor, materialProfileName, amount }
        """

        data  = request.json
        loadFor = data.get("loadFor", "swap")
        material_profile_name = data.get("materialProfileName")
        amount = data.get("amount", 0)

        material = None

        if loadFor == "purge":
            # Select current profile
            material_profile_name = self.tools[tool]["filament_material_name"]
            material = self._get_material_from_name(material_profile_name)
            temp = int(material['extruder'])
        else:
            if not material_profile_name or material_profile_name == self.default_material_name:
                # The user wants to load a None profile. So we just finish the swap wizard
                self._send_client_message(ClientMessages.FILAMENT_CHANGE_LOAD_FINISHED, { "profile": None })
                return make_response(jsonify(), 200)

            # Find profile from key
            material = self._get_material_from_name(material_profile_name)
            temp = material['extruder']

        # Heat up to new profile temperature and load filament
        if loadFor == "purge":
            self.loading_for_purging = True
            amount = self.tools.get(tool, {}).get("filament_amount", 0) 
        else:
            self.loading_for_purging = False

        self._logger.debug("Load filament called with material {material}, tool {tool}, amount {amount}".format(material=material['name'], tool=tool, amount=amount))

        load_filament_partial = partial(self._load_filament, amount=amount, material_name=material["name"])

        self.heat_to_temperature(tool, temp, load_filament_partial)

        return make_response(jsonify(), 200)

    @BlueprintPlugin.route("/filament/<string:tool>/extrude/start", methods=["POST"])
    def extrude_start(self, tool):
        """
        Begins continuous purging of the extruder. 
        Request: { direction (-1 or +1) }
        """
        data = request.json
        direction = data.get("direction", 1)

        # Limit input to positive or negative, no multiplication factors allowed here
        if direction < 0:
            direction = -1
        elif direction >= 0:
            direction = 1

        self._load_filament_cont(tool, direction)
        return make_response(jsonify(), 200)

    @BlueprintPlugin.route("/filament/<string:tool>/extrude/finish", methods=["POST"])
    def extrude_finish(self, tool):
        """
        Stops continuous purging of the extruder. 
        """

        if self.load_filament_timer:
            self.load_filament_timer.cancel()
        return make_response(jsonify(), 200)

    @BlueprintPlugin.route("/filament/<string:tool>/change/finish", methods=["POST"])
    def change_filament_finish(self, tool):
        # Still don't know if this is the best spot TODO
        if self.load_filament_timer:
            self.load_filament_timer.cancel()

        context = { "filamentAction": self.filament_action,
                    "stepperTimeout": self.current_printer_profile["defaultStepperTimeout"] if "defaultStepperTimeout" in self.current_printer_profile else None,
                    "pausedFilamentSwap": self.paused_filament_swap
                    }

        self._execute_printer_script("change_filament_done", context)

        self._restore_after_load_filament(tool)
        self._logger.debug("Finish change filament called")
        return make_response(jsonify(), 200)

    @BlueprintPlugin.route("/filament/<string:tool>/change/cancel", methods=["POST"])
    def change_filament_cancel(self, tool):
        """
        Abort mission! Stop filament loading.
        Cancel all heat up and reset
        """

        # Loading has already started, so just cancel the loading, which will stop heating already.
        context = { "filamentAction": self.filament_action,
                    "stepperTimeout": self.current_printer_profile["defaultStepperTimeout"] if "defaultStepperTimeout" in self.current_printer_profile else None,
                    "pausedFilamentSwap": self.paused_filament_swap
                    }

        self._immediate_cancel(False)

        self._execute_printer_script("change_filament_done", context)

        if self.load_filament_timer:
            self.load_filament_timer.cancel()
        # Other wise we haven't started loading yet, so cancel the heating
        # and clear all callbacks added to the heating.
        else:
            with self.heating_callback_mutex:
                del self.heating_callbacks[:]
            self._restore_after_load_filament(tool)
            self._send_client_message(ClientMessages.FILAMENT_CHANGE_CANCELLED)

        self._logger.debug("Cancel change filament called")
        return make_response(jsonify(), 200)

    @BlueprintPlugin.route("/filament/<string:tool>/detection/stop_timer", methods=["POST"])
    def filament_detection_stop_timer(self, tool):
        """
        Stops the filament detection temperature safety timer
        """

        if self.temperature_safety_timer:
            self.temperature_safety_timer.cancel()
            self.temperature_safety_timer = None
            self._send_client_message(ClientMessages.TEMPERATURE_SAFETY, { "timer": self.temperature_safety_timer_value })

        return make_response(jsonify(), 200)

    @BlueprintPlugin.route("/filament/<string:tool>/detection/finish", methods=["POST"])
    def filament_detection_finish(self, tool):
        """
        Finishes the filament detection wizard, resumes the print
        """
        self._printer.toggle_pause_print()
        return make_response(jsonify(), 200)

    @BlueprintPlugin.route("/filament/<string:tool>/detection/cancel", methods=["POST"])
    def filament_detection_cancel(self, tool):
        """
        Cancels the print if there was a "filament detection". Does not stop the temperature timer!
        """
        self._printer.cancel_print()
        return make_response(jsonify(), 200)

    ## Printer API

    @BlueprintPlugin.route("/printer/start_print/<string:mode>", methods=["POST"])
    def start_print(self, mode):
        """
        Sends a M605 command to the printer to initiate the given print mode and starts the currently selected job afterwards.
        """
        
        self._set_print_mode(PrintModes.get_from_string(mode))
        self._printer.start_print()

        return make_response(jsonify(), 200)

    @BlueprintPlugin.route("/printer", methods=["GET"])
    def get_printer_info(self):
        """
        Returns information about the printer state, whether it is homed and whether it is in an error state.
        {
        isHomed: bool,
        isHoming: bool,
        printerErrorReason: string,
        printerErrorExtruder: string
        }
        """
        return make_response(jsonify({
                'isHomed': self.is_homed,
                'isHoming': self.is_homing,
                'printerErrorReason': self.printer_error_reason,
                'printerErrorExtruder': self.printer_error_extruder
                }), 200)

    @BlueprintPlugin.route("/printer/machine_info", methods=["GET"])
    def get_machine_info(self):
        """
        Returns information provided by the machine's firmware
        """
        return make_response(jsonify({
                'machine_info': self.machine_info
                }), 200)

    @BlueprintPlugin.route("/printer/homing/start", methods=["POST"])
    def homing_start(self):
        """
        Begins the homing procedure, required on startup of the printer
        """ 
        self._printer.commands('G28')
        self._send_client_message(ClientMessages.IS_HOMING)
        return make_response(jsonify(), 200)

    @BlueprintPlugin.route("/printer/reconnect", methods=["POST"])
    def printer_reconnect(self):
        """
        Tries to reconnect the printer after an error has occurred (will also try to send a M999)
        """
        self.send_M999_on_reconnect = True
        self._printer.connect()
        return make_response(jsonify(), 200)

    @BlueprintPlugin.route("/printer/notify_intended_disconnect", methods=["POST"])
    def notify_intended_disconnect(self):
        """
        Notifies that a disconnect of the printer was intended. Useful for maintenance procedures.
        """
        self.intended_disconnect = True
        return make_response(jsonify(), 200)

    @BlueprintPlugin.route("/printer/immediate_cancel", methods=["POST"])
    def immediate_cancel(self):
        """
        Tries to break the firmware out of the heating loop (with M108) and cancels the current print job.
        """
        self._immediate_cancel()
        return make_response(jsonify(), 200)

    @BlueprintPlugin.route("/printer/auto_shutdown/<string:toggle>", methods=["POST"])
    def auto_shutdown_toggle(self, toggle):
        """
        Sets auto-shutdown either on or off
        """
        self.auto_shutdown = toggle == "on"
        self._send_client_message(ClientMessages.AUTO_SHUTDOWN_TOGGLE, { "toggle" : self.auto_shutdown })
        self._logger.info("Auto shutdown set to {toggle}".format(toggle="on" if self.auto_shutdown else "off"))
        return make_response(jsonify(), 200)

    @BlueprintPlugin.route("/printer/auto_shutdown/cancel", methods=["POST"])
    def auto_shutdown_cancel(self):
        # User cancelled timer. So cancel the timer and send to front-end to close flyout.
        if self.auto_shutdown_timer:
            self.auto_shutdown_timer.cancel()
            self.auto_shutdown_timer = None
        self.auto_shutdown_after_movie_done = False
        self._send_client_message(ClientMessages.AUTO_SHUTDOWN_TIMER_CANCELLED)
        return make_response(jsonify(), 200)

    @BlueprintPlugin.route("/printer/debugging_action", methods=["POST"])
    def debugging_action(self):
        """
        Allows to trigger something in the back-end. Wired to the logo on the front-end. 
        """
        #self._printer.commands(['!!DEBUG:mintemp_error0']) # Lets the virtual printer send a MINTEMP message which brings the printer in error state
        self._on_filament_detection_during_print(self._printer._comm)
        return make_response(jsonify(), 200)

    ## Files API

    @BlueprintPlugin.route("/files/<string:origin>/<path:path>", methods=["GET"], strict_slashes=False)
    @BlueprintPlugin.route("/files/<string:origin>", methods=["GET"], strict_slashes=False)
    def get_files(self, origin, path = None):
        """
        A wrapper around OctoPrint's get_files. Also returns file lists for origins usb and cloud.
        """ 
        if origin == "cloud":
            files = self.cloud_storage.list_files(path, filter=self.browser_filter, recursive=False)
            return jsonify(files=files)
        elif(origin == "usb"):
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
                return make_response(jsonify({ "message": "Could not access the media folder"}), 500)


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
            
            if path and octoprint.filemanager.valid_file_type(path, type="machinecode"):
                # File
                return octoprint.server.api.files.readGcodeFile(origin, path)
            else:
                # Folder
                return octoprint.server.api.files.readGcodeFilesForOrigin(origin)

    @BlueprintPlugin.route("/files/<string:target>/<path:filename>", methods=["GET"])
    def readGcodeFile(target, filename):
        """ 
        Alias for gcode files requests from OctoPrints
        """
        return octoprint.server.api.files.readGcodeFile(target, filename)

    @BlueprintPlugin.route("/files/select/<string:origin>/<path:path>", methods=["POST"])
    def select_file(self, origin, path):
        """
        Selects a file to be printed. Intened for non-local origins (usb, cloud ...)
        """
        if origin == "cloud":
            return self._select_cloud_file(path)
        elif origin == "usb":
            return self._select_usb_file(path)

    @BlueprintPlugin.route("/files/unselect", methods=["POST"])
    def unselect_file(self):
        """
        Resets the currently selected file to None
        """
        self._printer.unselect_file()
        return make_response(jsonify(), 200)

    @BlueprintPlugin.route("/files/delete_all", methods=["POST"])
    def delete_all_uploads(self):
        """
        Deletes all gcode files in the uploads folder
        """
        # Find the filename of the current print job
        selectedfile = None

        if self._printer._selectedFile:
            selectedfile = self._printer._selectedFile["filename"]


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

        if has_failed:
            return make_response(jsonify(result = "Could not delete all files"), 500)
        else:
            return make_response(jsonify(result = "OK"), 200);

    ## Timelapse API

    @BlueprintPlugin.route("/timelapse/delete_all", methods=["POST"])
    def delete_all_timelapses(self):
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

    ## USB Api

    @BlueprintPlugin.route("/usb", methods=["GET"])
    def get_usb(self):
        """ 
        Returns { isMediaMounted: bool } , indicating whether a USB stick is inserted and mounted.
        """
        return make_response(jsonify({
            "isMediaMounted": self.is_media_mounted
            }), 200)

    @BlueprintPlugin.route("/usb/save/<string:source_type>/<path:path>", methods=["POST"])
    def save_to_usb(self, source_type, path):
        """
        Saves a file to the usb drive. source_type must be either 'gcode', 'timelapse' or 'log'
        """
        if source_type == "gcode":
            return self._copy_gcode_to_usb(path)
        elif source_type == "timelapse":
            return self._save_timelapse_to_usb(path)
        elif source_type == "log":
            return self._copy_log_to_usb(path)

    # End API

    # TODO: Organize method definitions below this line

    def _notify_firmware_update(self, silent = False):

        firmware_info = self.get_firmware_update(True)
        firmware_info.update({ 'silent': silent })
        self._send_client_message(ClientMessages.FIRMWARE_UPDATE_NOTIFICATION, firmware_info)
        self.fetching_firmware_update = False

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
                self._send_client_message(ClientMessages.AUTO_FIRMWARE_UPDATE_STARTED)

                # Download the firmware update
                fw_path = None
                try:
                    fw_path = self.firmware_update_info.download_firmware(self.fw_version_info["url"])
                except:
                    self._logger.exception("Could not save firmware update. Disk full?")
                    self.auto_firmware_update_started = False
                    self._send_client_message(ClientMessages.AUTO_FIRMWARE_UPDATE_FAILED)
                    return False

                if not fw_path:
                    self._logger.error("Could not download firmware update. Offline?")
                    self.auto_firmware_update_started = False
                    self._send_client_message(ClientMessages.AUTO_FIRMWARE_UPDATE_FAILED)
                    return False

                # Flash the firmware update
                flashed = False
                try:
                    flashed = self.flash_firmware_update(fw_path)
                except:
                    self._logger.exception("Could not flash firmware update.")
                    self.auto_firmware_update_started = False
                    self._send_client_message(ClientMessages.AUTO_FIRMWARE_UPDATE_FAILED)
                    return False

                if not flashed:
                    self._logger.error("Could not flash firmware update.")
                    self.auto_firmware_update_started = False
                    self._send_client_message(ClientMessages.AUTO_FIRMWARE_UPDATE_FAILED)
                    return False

                self._logger.info("Auto firmware update finished.")
                self.auto_firmware_update_started = False
                self._send_client_message(ClientMessages.AUTO_FIRMWARE_UPDATE_FINISHED)

            else:
                self._logger.error("New firmware required, but no new version was found online.")
                return False

        # By default return success
        return True

    def flash_firmware_update(self, firmware_path):
        flash_plugin = self._plugin_manager.get_plugin('flasharduino')

        if flash_plugin:
            if hasattr(flash_plugin.__plugin_implementation__, 'do_flash_hex_file'):
                self.intended_disconnect = True
                _, port, _, _ = self._printer.get_current_connection()
                if not port:
                    port = '/dev/ttyUSB0'
                board = "m2560"
                programmer = "wiring"
                baudrate = "115200"
                ext_path = os.path.basename(firmware_path)

                return getattr(flash_plugin.__plugin_implementation__, 'do_flash_hex_file')(board, programmer, port, baudrate, firmware_path, ext_path)
            else:
                self._logger.warning("Could not flash firmware. FlashArduino plugin not up to date.")
        else:
            self._logger.warning("Could not flash firmware. FlashArduino plugin not loaded.")

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

    def _perform_forced_updates(self):
        """ 
        Loops the update info list checking for any update that needs to be executed on startup. When found, executed immediately.
        """
        any_update = False
        for update_info in self.update_info:
            if update_info["forced_update"]:
                update_info["update"] = True
                any_update = True

        if any_update:
            self._send_client_message(ClientMessages.FORCED_UPDATE)
            self._update_plugins("all")

        return any_update

    def _update_plugins(self, plugin):
        if self.installing_updates:
            self._logger.warn("Update installer thread already started. Not starting another one.")
            self._send_client_message(ClientMessages.UPDATE_ERROR)
            return

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
            self._send_client_message(ClientMessages.UPDATE_ERROR)
            return

        self.installing_updates = True

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
                self._send_client_message(ClientMessages.UPDATE_ERROR)
                # We encountered an error lets just return out of this and see what went wrong in the logs.
                return

        # We made it! We have updated everything, send this great news to the front end
        self._logger.info("Update done!")
        self._send_client_message(ClientMessages.UPDATE_SUCCESS)

        # We're closing the thread, so release the lock
        self.installing_updates = False

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
                self._send_client_message(ClientMessages.INTERNET_OFFLINE)
            # Return out of the worker, we can't update - not online
            self.fetching_updates = False
            return

        if not octoprint_lui.util.github_online():
            # Only send a message to the front end if the user requests the update
            if force:
                self._send_client_message(ClientMessages.GITHUB_OFFLINE)
            # Return out of the worker, we can't update - not online
            self.fetching_updates = False
            return
        try:
            update_info_updated = self._update_needed_version_all(update_info)
            self.update_info = update_info_updated
        except Exception as e:
            self._logger.debug("Something went wrong in the git fetch thread: {error}".format(error= e))
            return self._send_client_message(ClientMessages.UPDATE_FETCH_ERROR)
        finally:
            self.fetching_updates = False
            self.last_git_fetch = time.time()

        data = dict(update=self._create_update_frontend(self.update_info), machine_info=self.machine_info)
        self._send_client_message(ClientMessages.UPDATE_FETCH_SUCCESS, data)
        return

    def _update_needed_version_all(self, update_info):
        for update in update_info:
            update['update'] = self._is_update_needed(update['path'])
            plugin_info = self._plugin_manager.get_plugin_info(update['identifier'])
            if plugin_info:
                update['version'] = plugin_info.version
        return update_info

    def _is_update_needed(self, path):
        branch_name = None
        with self.git_lock:
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

            with self.git_lock:
                try:
                    local = subprocess.check_output(['git', 'rev-parse', branch_name], cwd=path)
                    local = local.strip('\n')
                except subprocess.CalledProcessError as e:
                    msg = "Git check failed for local:{path}. Message: {message}. Output: {output}".format(path=path, message = e.message, output = e.output)
                    self._logger.warn(msg)
                    raise UpdateError(msg, e)

            with self.git_lock:
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
            "force_first_run": False,
            "debug_bundling" : False
        }

    def find_assets(self, rel_path, file_ext):
        result = []
        base_path = os.path.join(self._basefolder, "static", rel_path)

        for filename in os.listdir(base_path):
            complete_path = os.path.join(base_path, filename)
            if os.path.isfile(complete_path) and filename.endswith(file_ext):
                result.append('plugin/lui/' + rel_path + '/' + filename)

        return result

    def find_minified(self, js_list):
        result = []

        for path in js_list:
            if path.startswith('plugin/lui/'):
                strippped_path = path[11:-3]
            else:
                strippped_path = path[:-3]

            full_path = os.path.join(self._basefolder, strippped_path + '.min.js')
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
                    'plugin/lui/js/lib/jquery/jquery-3.1.1.js',
                    'plugin/lui/js/lib/jquery/jquery.ui.widget-1.11.4.js',
                    'plugin/lui/js/lib/jquery/jquery.iframe-transport.js',
                    'plugin/lui/js/lib/jquery/jquery.fileupload-9.14.2.js',
                    'plugin/lui/js/lib/jquery/jquery.slimscroll-1.3.8.js',
                    'plugin/lui/js/lib/jquery/jquery.keyboard-1.26.19.js',
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
                    'plugin/lui/js/lib/notify-0.4.2.js',
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
            "printer_profile": self.current_printer_profile,
            "reserved_usernames": self.reserved_usernames
        }

        args.update(render_kwargs)

        response = make_response(render_template("index_lui.jinja2", **args))

        return response

    def is_blueprint_protected(self):
        # Override OctoPrint blueprint protection method
        # this allows us to make exceptions for certain URLs
        from octoprint.server.util import apiKeyRequestHandler, corsResponseHandler

        def luiApiKeyRequestHandler():
            if request.endpoint in self.api_exceptions:
                print request.endpoint
                return
            else:
                return apiKeyRequestHandler()

        self._blueprint.before_request(luiApiKeyRequestHandler)
        self._blueprint.after_request(corsResponseHandler)

        return False

    @BlueprintPlugin.route("/webcamstream", methods=["GET"])
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

    

    def _firmware_update_required(self):

        if not self.model in self.firmware_version_requirement:
            self._logger.debug('No firmware version check. Model not found in version requirement.')
            return False
        elif "firmware_version" in self.machine_info:
            version_req = '>=' + str(self.firmware_version_requirement[self.model])

            if "firmware_version" in self.machine_info:
                if not self.machine_info["firmware_version"]:
                    self._logger.warn('Could not determine current firmware version. Defaulting to 0.0.')
                    current_version = "0.0"
                else:
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

    def _immediate_cancel(self, cancel_print = True):
        self._logger.debug("Immediate cancel")

        if self._printer._comm:
            q = self._printer._comm._send_queue
            with q.mutex:
                q.queue.clear()

            self._printer._comm._sendCommand('M108')

        if cancel_print:
            self._printer.cancel_print()

    
    

    def _preheat_for_calibration(self):
        target_bed_temp = 0

        for tool in self.tools:
            if tool == "bed":
                continue

            material = self._get_material_from_name(self.tools[tool]["filament_material_name"])

            if not material:
                self._logger.warning("Trying to preheat, but no material is loaded in {0}".format(tool))
                continue

            target_temp = int(material["extruder"])
            target_bed_temp = max(target_bed_temp, int(material["bed"]))

            self.heat_to_temperature(tool, target_temp)

        if target_bed_temp > 0:
            self.heat_to_temperature("bed", target_bed_temp)

    def _copy_calibration_file(self, calibration_src_filename):
        calibration_src_path = None
        calibration_dst_filename = "calibration.gcode"
        calibration_dst_relpath = "calibration"
        calibration_dst_path = octoprint.server.fileManager.join_path(octoprint.filemanager.FileDestinations.LOCAL, calibration_dst_relpath, calibration_dst_filename)
        calibration_src_path = os.path.join(self._basefolder, "gcodes", calibration_src_filename)
        self._logger.debug("Calibration destination path: {0}".format(calibration_dst_path))
        upload = octoprint.filemanager.util.DiskFileWrapper(calibration_src_filename, calibration_src_path, move = False)

        try:
            # This will do the actual copy
            added_file = octoprint.server.fileManager.add_file(octoprint.filemanager.FileDestinations.LOCAL, calibration_dst_path, upload, allow_overwrite=True)
        except octoprint.filemanager.storage.StorageError:
            self._logger.exception("Could not add calibration file: {0}".format(calibration_dst_path))
            self._send_client_message(ClientMessages.CALIBRATION_FAILED, { "calibration_type": self.calibration_type})
            return None

        path_on_disk = octoprint.server.fileManager.path_on_disk(octoprint.filemanager.FileDestinations.LOCAL, added_file)
        self._logger.debug("Calibration path on disk: {0}".format(path_on_disk))
        return path_on_disk

    def _disable_timelapse(self):
        config = self._settings.global_get(["webcam", "timelapse"], merged=True)
        config["type"] = "off"

        octoprint.timelapse.configure_timelapse(config, False)

    def _restore_timelapse(self):
        config = self._settings.global_get(["webcam", "timelapse"], merged=True)
        octoprint.timelapse.configure_timelapse(config, False)

    def _on_calibration_event(self, event):
        if event == Events.PRINT_STARTED:
            self._send_client_message(ClientMessages.CALIBRATION_STARTED, { "calibration_type": self.calibration_type})
        elif event == Events.PRINT_PAUSED: # TODO: Handle these cases or disable pause/resume when calibrating
            self._send_client_message(ClientMessages.CALIBRATION_PAUSED, { "calibration_type": self.calibration_type})
        elif event == Events.PRINT_RESUMED: # TODO: Handle these cases or disable pause/resume when calibrating
            self._send_client_message(ClientMessages.CALIBRATION_RESUMED, { "calibration_type": self.calibration_type})
        elif event == Events.PRINT_DONE:
            self._send_client_message(ClientMessages.CALIBRATION_FINISHED, { "calibration_type": self.calibration_type})
            self.calibration_type = None
            self._restore_timelapse()
        elif event == Events.PRINT_FAILED or event == Events.ERROR:
            self._send_client_message(ClientMessages.CALIBRATION_FAILED, { "calibration_type": self.calibration_type})
            self.calibration_type = None
            self._restore_timelapse()

    

    def _get_current_materials(self):
        """ 
        Returns a dictionary of the currently loaded materials 
        """

        materials = { tool: info["filament_material_name"] for tool, info in self.tools.iteritems() if tool != "bed" }

        return materials

    def _get_current_filaments(self):
        """ 
        Returns a list of the currently loaded filaments [{tool, material, amount}]
        """

        filaments = [{ "tool": tool, 
                      "materialProfileName": info["filament_material_name"], 
                      "amount": info["filament_amount"] } 

                     for tool, info in self.tools.iteritems() if tool != "bed"]
        
        return sorted(filaments, key=lambda f: f["tool"])

    def _execute_printer_script(self, script_name, context = None):
        """
        Executes a printer script in form of a .jinja2 file
        """
        full_script_name = self.model.lower() + "_" + script_name + ".jinja2"
        self._logger.debug("Executing script {0}".format(full_script_name))
        self._printer.script(full_script_name, context, must_be_set = False)

    def _head_in_swap_position(self):
        """
        Decides when to update UI when head is in swap position
        """
        if self.powerbutton_handler:
            self._disconnect_and_powerdown() #UI is updated after power down
        else:
            self._send_client_message(ClientMessages.HEAD_IN_SWAP_POSITION) #Update UI straight away

    def _disconnect_and_powerdown(self):
         """
         Disconnects and powers down the printer
         """
         if self.powerbutton_handler:
             self.powerdown_after_disconnect = True
             self.intended_disconnect = True
             self._printer.disconnect()

    def _do_powerdown_after_disconnect(self):
        """
        Powers down printer after disconnect
        """
        if self.powerbutton_handler:
            self.powerbutton_handler.disableAuxPower()
            self._logger.debug("Auxiliary power down for maintenance")
            self._send_client_message(ClientMessages.HEAD_IN_SWAP_POSITION)

    def _power_up_after_maintenance(self):
        """
        Powers up printer after maintenance
        """
        if self.powerbutton_handler:
            self._send_client_message(ClientMessages.POWERING_UP_AFTER_SWAP)
            # Enable auxiliary power. This will fully reset the printer, so full homing is required after.
            self.powerbutton_handler.enableAuxPower()
            self._logger.debug("Auxiliary power up after maintenance")
            time.sleep(5) # Give it 5 sec to power up
            #TODO: Maybe a loop with some retries instead of a 5-sec-timer?
            #TODO: Or monitor if /dev/ttyUSB0 exists?
            self.connecting_after_maintenance = True
            self._printer.connect()

    def _auto_home_after_maintenance(self):
        """
        Homes printer after maintenance and brings it back to the filament load position.
        """
        self.is_homed = False #Reset is_homed, so LUI waits for a G28 complete, and then sends UI update
        self._printer.home(['x','y','z'])
        self.move_to_filament_load_position()

    def _select_cloud_file(self, path):
        if not octoprint.filemanager.valid_file_type(path, type="machinecode"):
            return make_response(jsonify({ "message": "Cannot select {filename} for printing, not a machinecode file".format(**locals()) }), 415)

        _, filename = self._file_manager.split_path("cloud", path)

        # determine current job
        currentPath = None
        currentFilename = None
        currentOrigin = None
        currentJob = self._printer.get_current_job()
        if currentJob is not None and "file" in currentJob.keys():
            currentJobFile = currentJob["file"]
            if currentJobFile is not None and "name" in currentJobFile.keys() and "origin" in currentJobFile.keys() and currentJobFile["name"] is not None and currentJobFile["origin"] is not None:
                currentPath, currentFilename = self._file_manager.sanitize(FileDestinations.LOCAL, currentJobFile["name"])
                currentOrigin = currentJobFile["origin"]

        # determine future filename of file to be uploaded, abort if it can't be uploaded
        try:
            futurePath, futureFilename = self._file_manager.sanitize(FileDestinations.LOCAL, filename)
        except:
            futurePath = None
            futureFilename = None

        if futureFilename is None:
            return make_response(jsonify({ "message": "Can not select file %s, wrong format?" % filename }), 415)

        if futurePath == currentPath and futureFilename == currentFilename and (self._printer.is_printing() or self._printer.is_paused()):
            return make_response(jsonify({ "message": "Trying to overwrite file that is currently being printed: %s" % currentFilename }), 409)
        
        futureFullPath = self._file_manager.join_path(FileDestinations.LOCAL, futurePath, futureFilename)

        def download_progress(progress):
            self._send_client_message(ClientMessages.MEDIA_FILE_COPY_PROGRESS, { "percentage" : progress*100 })

        self.cloud_storage.download_file(path, futureFullPath, download_progress)
        self._send_client_message(ClientMessages.MEDIA_FILE_COPY_COMPLETE)
        self._event_bus.fire(Events.UPLOAD, {"name": futureFilename, "path": futureFilename, "target": "local"})

        location = "/files/" + FileDestinations.LOCAL + "/" + str(filename)

        files = {
            FileDestinations.LOCAL: {
                "name": filename,
                "origin": FileDestinations.LOCAL,
                "refs": {
                    "resource": location,
                    "download": "downloads/files/" + FileDestinations.LOCAL + "/" + str(filename)
                }
            }
        }


        self._printer.select_file(futureFullPath, False, False)
        r = make_response(jsonify(files=files, done=True), 201)
        r.headers["Location"] = location

        return r

    def _select_usb_file(self, path):
        target = "usb"

        #TODO: Feels like it's not really secure. Fix
        path = os.path.join(self.media_folder, path)
        if not (os.path.exists(path) and os.path.isfile(path)):
            return make_response(jsonify({ "message": "File not found on '%s': %s" % (target, filename) }), 404)

        # selects/loads a file
        if not octoprint.filemanager.valid_file_type(path, type="machinecode"):
            return make_response(jsonify({ "message": "Cannot select {filename} for printing, not a machinecode file".format(**locals()) }), 415)

        # Now the full path is known, remove any folder names from file name
        _, filename = self._file_manager.split_path("usb", path)
        upload = octoprint.filemanager.util.DiskFileWrapper(filename, path, move = False)

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
            return make_response(jsonify({ "message": "Can not select file %s, wrong format?" % upload.filename }), 415)

        if futurePath == currentPath and futureFilename == currentFilename and target == currentOrigin and (self._printer.is_printing() or self._printer.is_paused()):
            return make_response(jsonify({ "message": "Trying to overwrite file that is currently being printed: %s" % currentFilename }), 409)

        futureFullPath = self._file_manager.join_path(FileDestinations.LOCAL, futurePath, futureFilename)

        def on_selected_usb_file_copy():
            percentage = (float(os.path.getsize(futureFullPath)) / float(os.path.getsize(path))) * 100.0
            self._logger.debug("Copy progress: %f" % percentage)
            self._send_client_message(ClientMessages.MEDIA_FILE_COPY_PROGRESS, { "percentage" : percentage })

        is_copying = True

        def is_copying_selected_usb_file():
            return is_copying

        def copying_finished():
            self._send_client_message(ClientMessages.MEDIA_FILE_COPY_COMPLETE)

        # Start watching the final file to monitor it's filesize
        timer = RepeatedTimer(1, on_selected_usb_file_copy, run_first = False, condition = is_copying_selected_usb_file, on_finish = copying_finished)
        timer.start()

        try:
            # This will do the actual copy
            added_file = octoprint.server.fileManager.add_file(octoprint.filemanager.FileDestinations.LOCAL, futureFullPath, upload, allow_overwrite=True)
        except octoprint.filemanager.storage.StorageError as e:
            timer.cancel()
            if e.code == octoprint.filemanager.storage.StorageError.INVALID_FILE:
                return make_response(jsonify({ "message": "Could not upload the file \"{}\", invalid type".format(upload.filename) }), 400)
            else:
                return make_response(jsonify({ "message": "Could not upload the file \"{}\"".format(upload.filename) }), 500)
        finally:
             self._send_client_message(ClientMessages.MEDIA_FILE_COPY_FAILED)

        # Stop the timer
        is_copying = False

        self._printer.select_file(futureFullPath, False, False)

        self._event_bus.fire(octoprint.events.Events.UPLOAD, {"name": added_file, "path": added_file, "target": "local"})

        location = flask.url_for(".readGcodeFile", target=octoprint.filemanager.FileDestinations.LOCAL, filename=added_file, _external=True)

        files = {
            octoprint.filemanager.FileDestinations.LOCAL: {
                "name": added_file,
                "path": added_file,
                "origin": octoprint.filemanager.FileDestinations.LOCAL,
                "refs": {
                    "resource": location,
                    "download": "downloads/files/" + octoprint.filemanager.FileDestinations.LOCAL + "/" + str(added_file)
                }
            }
        }

        r = make_response(jsonify(files=files, done=True), 201)
        r.headers["Location"] = location

        return r

    def _copy_gcode_to_usb(self, filename):
        if not self.is_media_mounted:
            return make_response(jsonify({ "message": "Could not access the media folder" }), 400)

        if not octoprint.filemanager.valid_file_type(filename, type="machinecode"):
            return make_response(jsonify(error="Not allowed to copy this file"), 400)

        uploads_folder = self._settings.global_get_basefolder("uploads")
        src_path = os.path.join(uploads_folder, filename)

        return self._copy_file_to_usb(filename, src_path, "Leapfrog-gcodes", ClientMessages.GCODE_COPY_PROGRESS , ClientMessages.GCODE_COPY_FINISHED, ClientMessages.GCODE_COPY_FAILED)

    def _copy_timelapse_to_usb(self, filename):
        if not self.is_media_mounted:
            return make_response(jsonify({ "message": "Could not access the media folder"}), 400)

        if not octoprint.util.is_allowed_file(filename, ["mpg", "mpeg", "mp4"]):
            return make_response(jsonify(error="Not allowed to copy this file"), 400)

        timelapse_folder = self._settings.global_get_basefolder("timelapse")
        src_path = os.path.join(timelapse_folder, filename)

        return self._copy_file_to_usb(filename, src_path, "Leapfrog-timelapses", ClientMessages.TIMELAPSE_COPY_PROGRESS, ClientMessages.TIMELAPSE_COPY_FINISHED, ClientMessages.TIMELAPSE_COPY_FAILED)

    def _copy_log_to_usb(self, filename):
        if not self.is_media_mounted:
            return make_response(jsonify(error="Could not access the media folder"), 400)
        
        logs_folder = self._settings.global_get_basefolder("logs")
        src_path = os.path.join(logs_folder, filename)

        return self._copy_file_to_usb(filename, src_path, "Leapfrog-logs", ClientMessages.LOGS_COPY_PROGRESS, ClientMessages.LOGS_COPY_FINISHED, ClientMessages.LOGS_COPY_FAILED)

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
            return make_response(jsonify({ "message": "Insuffient space available on USB drive", "filename": filename }), 400)

        if drive_folder is None:
            return make_response(jsonify({ "message": "Insuffient space available on USB drive", "filename": filename }), 400)

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
            self._send_client_message(message_progress, { "percentage" : percentage, "filename": filename })

        is_copying = True

        def is_copying_file():
            return is_copying

        def file_copying_finished():
            self._send_client_message(message_complete, { "filename": filename })

        # Start monitoring copy status
        timer = RepeatedTimer(1, on_file_copy, run_first = False, condition = is_copying_file, on_finish = file_copying_finished)
        timer.start()

        try:
            #Create directory, if needed
            if not os.path.isdir(folder_path):
                os.mkdir(folder_path)

            shutil.copy2(src_path, new_full_path)
        except Exception as e:
            timer.cancel()
            self._send_client_message(message_failed, { "filename": filename })
            return make_response(jsonify({ "message" : "File error during copying: %s" % e.message, "filename": filename }), 500)
        finally:
            is_copying = False

        return make_response(jsonify(), 200)     

    # Filament change helpers

    def _load_filament(self, tool, amount, material_name):
        """
        Begins to load the filament by running gcodes with small extrusions. 

        tool: The tool to run the loading procedure for
        amount: The amount of filament to record after the loading has finished
        material_name: The name of the material to record after the loading has finished
        """

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

            load_filament_repeater_partial = partial(self._load_filament_repeater, tool=tool, direction=1, initial=load_initial, change=load_change)
            load_filament_before_finished_partial = partial(self._load_filament_before_finished, tool=tool, amount=amount, material_name=material_name)
            load_filament_cancelled_partial = partial(self._load_filament_cancelled, tool=tool)
            self.load_filament_timer = RepeatedTimer(0.5,
                                                    load_filament_repeater_partial,
                                                    run_first=True,
                                                    condition=self._load_filament_running,
                                                    on_condition_false=load_filament_before_finished_partial,
                                                    on_cancelled=load_filament_cancelled_partial,
                                                    on_finish=self._load_filament_finished)
            self.load_filament_timer.start()
            self._send_client_message(ClientMessages.FILAMENT_CHANGE_LOAD_STARTED)

    def _unload_filament(self, tool):
        ## Only start a timer when there is none running
        if self.load_filament_timer is None:

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
            unload_filament_partial = partial(self._load_filament_repeater, tool=tool, direction=-1, initial=unload_initial, change=unload_change)
            unload_filament_before_finished_partial = partial(self._unload_filament_before_finished, tool=tool)
            unload_filament_cancelled_partial = partial(self._load_filament_cancelled, tool=tool)
            self.load_filament_timer = RepeatedTimer(0.5,
                                                    unload_filament_partial,
                                                    run_first=True,
                                                    condition=self._load_filament_running,
                                                    on_condition_false=unload_filament_before_finished_partial,
                                                    on_cancelled=unload_filament_cancelled_partial,
                                                    on_finish=self._unload_filament_finished)
            self.load_filament_timer.start()
            self._send_client_message(ClientMessages.FILAMENT_CHANGE_UNLOAD_STARTED)

    def _load_filament_repeater(self, tool, direction, initial, change=None):
        load_extrusion_amount = initial['amount']
        load_extrusion_speed = initial['speed']

        # Swap to the change condition
        if change:
            if (self.load_amount >= change['start']):
                load_extrusion_amount = change['amount']
                load_extrusion_speed = change['speed']

        # Set global load_amount
        if self.is_virtual:
            self.load_amount += abs(30*load_extrusion_amount)
        else:
            self.load_amount += abs(load_extrusion_amount)

        # Run extrusion command
        self._printer.commands("G1 E%s F%d" % (load_extrusion_amount, load_extrusion_speed))

        # Check loading progress
        progress = int((self.load_amount / self.load_amount_stop) * 100)
        # Send message every other percent to keep data stream to minimum
        if progress % 2:
            self._send_client_message(ClientMessages.FILAMENT_CHANGE_LOAD_PROGRESS, { "progress" : progress, "tool": tool, "direction": direction })

    def _load_filament_running(self):
        return self.load_amount <= self.load_amount_stop

    def _load_filament_before_finished(self, tool, amount, material_name):

        # When loading is complete, set new loaded filament
        self.tools[tool]["filament_amount"] = amount
        self.tools[tool]["filament_material_name"] = material_name

        # Persist and notify client
        self._save_filament_to_db(tool)
        self._send_client_message(ClientMessages.FILAMENT_CHANGE_LOAD_FINISHED, { "tool": tool, "profile": { "amount": amount, "material": material_name } })

    def _unload_filament_before_finished(self, tool):
        # When unloading finished, set standard None filament.
        self.tools[tool]["filament_amount"] = 0
        self.tools[tool]["filament_material_name"] = self.default_material_name

        # Persist and notify client
        self._save_filament_to_db(tool)
        self._send_client_message(ClientMessages.FILAMENT_CHANGE_UNLOAD_FINISHED)

    def _load_filament_finished(self):
        self._logger.debug("_load_filament_finished")
        # Loading is finished, reset load timer and back to normal movements
        self.restore_extrusion_mode()
        self.load_filament_timer = None

    def _unload_filament_finished(self):
        # Loading is finished, reset load timer and back to normal movements
        self.restore_extrusion_mode()
        self.load_filament_timer = None

    def _load_filament_cont(self, tool, direction):
        ## Only start a timer when there is none running
        if self.load_filament_timer is None:

            # Make sure the active tool is correct
            self._printer.change_tool(tool)

            # Determine loading parameters for continuous extrude
            self.load_amount = 0
            self.load_amount_stop = self.current_printer_profile["filament"]["contLoadAmountStop"]
            amount = self.current_printer_profile["filament"]["contLoad"]["amount"]
            speed = self.current_printer_profile["filament"]["contLoad"]["speed"]
            load_cont_initial = dict(amount=amount * direction, speed=speed)
            self.set_extrusion_mode("relative")

            # Prepare repeatedtimer function calls
            load_cont_partial = partial(self._load_filament_repeater, tool=tool, direction=direction, initial=load_cont_initial)
            load_cont_finished_partial = partial(self._load_filament_cont_finished, tool=tool, direction=direction)

            # Start extrusion
            self.load_filament_timer = RepeatedTimer(0.5,
                                                    load_cont_partial,
                                                    run_first=True,
                                                    condition=self._load_filament_running,
                                                    on_finish=load_cont_finished_partial)
            self.load_filament_timer.start()

            # Notify client
            self._send_client_message(ClientMessages.FILAMENT_EXTRUDING_STARTED, { "tool": tool, "direction": direction })

    def _load_filament_cont_finished(self, tool, direction):
        self._logger.debug("_load_filament_cont_finished")
        self.restore_extrusion_mode()
        self.load_filament_timer = None

        self._send_client_message(ClientMessages.FILAMENT_EXTRUDING_FINISHED, { "tool": tool, "direction": direction })

    def _load_filament_cancelled(self, tool):
        # A load or unload action has been cancelled, turn off the heating
        # send cancelled info.
        self._restore_after_load_filament(tool)
        self._send_client_message(ClientMessages.FILAMENT_CHANGE_CANCELLED)

    def _restore_after_load_filament(self, tool):
        target_temp = 0
        self._logger.debug("Restoring after filament change. Filament change tool: {0}. Paused position: {1}".format(tool, self.paused_position))

        if self.paused_filament_swap:
            # Restore temperature. Coordinates are restored by beforePrintResumed
            target_temp = self.paused_temperatures[tool]["target"]

        # We only "messed" with the filament change tool temperature, so no need to restore the temp of the other tool
        self._printer.set_temperature(tool, target_temp)

    # End filament change helpers

    # Client Message helpers
    def _send_client_message(self, message_type, data=None):

        if message_type != ClientMessages.TOOL_STATUS:
            self._logger.debug("Sending client message with type: {type}, and data: {data}".format(type=message_type, data=data))

        self._plugin_manager.send_plugin_message(self._identifier, dict(type=message_type, data=data))

    def send_client_filament_amount(self):
        #TODO: Refactor (also client side), so single_prop_dict is no longer necessary
        data = {"extrusion": self._single_prop_dict(self.tools, "current_print_extrusion_amount"), "filament": self._single_prop_dict(self.tools, "filament_amount")}
        self._send_client_message(ClientMessages.UPDATE_FILAMENT_AMOUNT, data)

    # End client Message helpers

    # Filament persistance helpers

    def _update_filament_from_db(self):
        
        for tool in self.tools:
            data = self.filament_database.get(self._filament_query.tool == tool)
            if data:
                self.tools[tool]["filament_amount"] = data.get("amount", 0)
                self.tools[tool]["filament_material_name"] = data.get("material_name", self.default_material_name)
            else:
                self.tools[tool]["filament_amount"] = 0
                self.tools[tool]["filament_material_name"] = self.default_material_name

    def _save_filament_to_db(self, tool = None):
        if tool:
            self._save_filament_to_db_for_tool(tool)
        else:
            for tool in self.tools:
                if tool != "bed":
                    self._save_filament_to_db_for_tool(tool)
            
    def _save_filament_to_db_for_tool(self, tool):
        
        amount = self.tools.get(tool, {}).get("filament_amount", 0)
        material_name = self.tools.get(tool, {}).get("filament_material_name", self.default_material_name)

        self._logger.debug("Saving filament information to database for {0}. Material: {1}, amount: {2}".format(tool, material_name, amount))

        if self.filament_database.contains(self._filament_query.tool == tool):
            self.filament_database.update({'amount': amount, 'material_name': material_name}, self._filament_query.tool == tool)
        else:
            self.filament_database.insert({'tool': tool, 'amount': amount, 'material_name': material_name})

    # End filament persistance helpers

    # Hooks

    def script_hook(self, comm, script_type, script_name):
        """ Executes a LUI print script based on a given print/printer event """
        if not script_type == "gcode":
            return None

        # In OctoPrint itself, these scripts are also executed after the event (even though the name suggests otherwise)
        if script_name == "beforePrintStarted":
            context = { "zOffset" : "%.2f" % -self._settings.get_float(["zoffset"]) }
            self._execute_printer_script("before_print_started", context)

        if script_name == "afterPrinterConnected":
            context = { "zOffset" : "%.2f" % -self._settings.get_float(["zoffset"]) }
            self._execute_printer_script("after_printer_connected", context)

        if script_name == "beforePrintResumed":
            self._logger.debug('Print resumed. Print mode: {0} Paused position: {1}'.format(PrintModes.to_string(self.paused_print_mode), self.paused_position))
            context = { "paused_position": self.paused_position, "paused_print_mode": self.paused_print_mode }
            self._execute_printer_script("before_print_resumed", context)

        if script_name == "afterPrintPaused":
             self._execute_printer_script("after_print_paused")

        return None, None

    def gcode_queuing_hook(self, comm_instance, phase, cmd, cmd_type, gcode, *args, **kwargs):
        """
        Removes X0, Y0 and Z0 from G92 commands
        These commands are problamatic with different print modes.
        Also sends M108 directly when they are queued
        """
        if gcode == "G92":
            new_cmd = re.sub(' [XYZ]0', '', cmd)
            return new_cmd,
        elif gcode == "M108":
            # Send M108 immediately
            self._logger.debug("M108")
            command_to_send = cmd.encode("ascii", errors="replace")
            if comm_instance.isPrinting() or comm_instance._alwaysSendChecksum:
                comm_instance._do_increment_and_send_with_checksum(command_to_send)
            else:
                comm_instance._do_send_without_checksum(command_to_send)
            # Remove command from queue
            return None,

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

    def _process_M82_M83(self, cmd):
        ##~ Process M82 and M83 commands. Handle relative extrusion
        if cmd == "M82":
            self.extrusion_mode = self.movement_mode
            self.relative_extrusion_trigger = False
        else:
            self.extrusion_mode = "relative"
            self.relative_extrusion_trigger = True

    def _process_G92(self, cmd):
        ##~ Process a G92 command and handle zero-ing of extrusion distances
        if self.regexExtruder.search(cmd):
            self.last_extrusion = 0
            self._logger.debug("Extruder zero: %s" % cmd)

    def _process_G0_G1(self, cmd, comm_instance):

        ##~ Process a G0/G1 command with extrusion
        extrusion_code = self.regexExtruder.search(cmd)
        if extrusion_code is not None:
            tool = "tool" + str(comm_instance.getCurrentTool())
            current_extrusion = float(extrusion_code.group(2))

            # Handle relative vs absolute extrusion
            if self.extrusion_mode == ExtrusionModes.RELATIVE:
                extrusion_amount = current_extrusion
            else:
                extrusion_amount = current_extrusion - self.last_extrusion

            # Add extrusion to current printing amount and remove from available filament
            if self.print_mode == PrintModes.SYNC or self.print_mode == PrintModes.MIRROR:

                # Use both tools when in sync or mirror mode.
                for tool in self.tools.keys():
                    self.tools[tool]["filament_amount"] -= extrusion_amount
                    self.tools[tool]["current_print_extrusion_amount"] += extrusion_amount
            else:

                # Only one tool in normal mode.
                self.tools[tool]["filament_amount"] -= extrusion_amount
                self.tools[tool]["current_print_extrusion_amount"] += extrusion_amount

            # Needed for absolute extrusion printing
            self.last_extrusion = current_extrusion

            if abs(self.tools[tool]["last_sent_filament_amount"] - self.tools[tool]["filament_amount"]) > self.filament_delta_send:
                self.send_client_filament_amount()
                self.tools[tool]["last_sent_filament_amount"] = self.tools[tool]["filament_amount"]

            if abs(self.tools[tool]["last_saved_filament_amount"] - self.tools[tool]["filament_amount"]) > self.filament_delta_save:
                self._save_filament_to_db()
                self.tools[tool]["last_saved_filament_amount"] = self.tools[tool]["filament_amount"]

    def _process_G28(self, cmd):
        ##~ Only do this check at the start up for now
        ##~ TODO: Find when we want to make the printer not is_homed any more.
        if not self.is_homed:
            if (all(c in cmd for c in 'XYZ') or cmd == "G28"):
                self.home_command_sent = True
                self.is_homing = True

    def _process_G32(self, cmd):
        self.levelbed_command_sent = True

    def _process_M400(self, cmd):
        self.wait_for_movements_command_sent = True

    def _on_movements_complete(self):
        """ 
        Fired when a M400 (wait for all movements) completes. Useful for maintenance procedures
        """
        if self.wait_for_swap_position:
            self.wait_for_swap_position = False
            self._head_in_swap_position()

    def gcode_received_hook(self, comm_instance, line, *args, **kwargs):
        if "FIRMWARE_NAME:" in line:
            self._on_firmware_info_received(line)

        if self.home_command_sent:
            if "ok" in line:
                self.home_command_sent = False
                self.is_homed = True
                self.is_homing = False
                self._send_client_message(ClientMessages.IS_HOMED)

        if self.levelbed_command_sent:
            if "MaxCorrectionValue" in line:
                max_correction_value = line[19:]
                self._send_client_message(ClientMessages.LEVELBED_PROGRESS, { "max_correction_value" : max_correction_value })
            if "ok" in line:
                self.levelbed_command_sent = False
                self._send_client_message(ClientMessages.LEVELBED_COMPLETE)

        if self.wait_for_movements_command_sent and "ok" in line:
            self.wait_for_movements_command_sent = False
            self._on_movements_complete()

        # Check if it is a temperature update, and we're waiting for a stabilized temperature
        if line.startswith("T0:"):
            self.tool_status_stabilizing = "W:" in line and not "W:?" in line

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

        self._send_client_message(ClientMessages.FILAMENT_ACTION_DETECTED, { "tool" : tool })
        comm.setPause(True)

        self.filament_action = True

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

    # End hooks

    def _temperature_safety_tick(self):
        self.temperature_safety_timer_value -= 1
        self._send_client_message(ClientMessages.TEMPERATURE_SAFETY, { "timer": self.temperature_safety_timer_value })

    def _temperature_safety_required(self):
        return self.temperature_safety_timer_value > 0

    def _temperature_safety_condition(self):
        """
        When temperature safety timer expires, heaters are turned off
        """
        for tool in self.tools.keys():
            self._printer.set_temperature(tool, 0)

    def on_printer_add_temperature(self, data):
        """
        PrinterCallback function that is called whenever a temperature is added to
        the printer interface.

        We use this call to update the tool status with the function check_tool_status()
        """

        self.current_temperature_data = data
        self.check_tool_status()

        if self.requesting_temperature_after_mintemp:
            self.requesting_temperature_after_mintemp = False
            self._mintemp_temperature_received()
    
    def _single_prop_dict(self, dic, prop):
        """
        For a given dictionary dic, returns the value of sub-property prop as value for all keys in dic.
        
        Example:
        dic = { key1: { a: val1, b: val2 }, key2: { a: val3, b: val4 } }

        _single_prop_dict(dic, "a") --> { key1: val1, key2: val3 }

        """
        return { key: value[prop] for key, value in dic.iteritems() }

    def check_tool_status(self):
        """
        Populate a the dict tool_status with the status of the tool.
        A tool can be:
            - IDLE
            - HEATING
            - STABILIZING
            - COOLING
            - READY
        """
        for tool, data in self.current_temperature_data.items():
            if tool == 'time':
                continue

            # some state vars
            has_target = data['target'] > 0

            if not has_target and data["actual"] <= 35:
                status = ToolStatuses.IDLE
            else:
                delta = data['target'] - data['actual']
                in_window = data['actual'] >= data['target'] + self.temperature_window[0] and data['actual'] <= data['target'] + self.temperature_window[1]
                stabilizing = self.tool_status_stabilizing or abs(delta) > self.instable_temperature_delta

                # process the status
                if in_window and stabilizing:
                    status = ToolStatuses.STABILIZING
                elif in_window and not stabilizing:
                    status = ToolStatuses.READY
                elif delta > 0:
                    status = ToolStatuses.HEATING
                else:
                    status = ToolStatuses.COOLING

            self.tools[tool]["status"] = status
            self.change_status(tool, status)

        self._send_client_message(ClientMessages.TOOL_STATUS, { "tool_status": self._single_prop_dict(self.tools, "status") })

    def change_status(self, tool, new_status):
        """
        Calls callback registered to tool change to status
        """
        if new_status == ToolStatuses.READY:
            with self.heating_callback_mutex:
                for callback in self.heating_callbacks:
                    try: callback(tool)
                    except: self._logger.exception("Something went horribly wrong on reaching the target temperature")
                del self.heating_callbacks[:]

    def heat_to_temperature(self, tool, temp, callback = None):
        """
        Heat tool up to temp and execute callback when tool is declared READY
        """
        ## Check if target temperature is same as the current target temperature
        ## and if the tool is already heated(READY), if so just run the callback
        ## This feels quite hacky so it might need to be altered. This is written to
        ## counter loading filament with the same profile deadlock.

        self._logger.debug("Heating up {tool} to {temp}".format(tool=tool, temp=temp))

        if (self.current_temperature_data[tool]['target'] == temp) and (self.tools[tool]["status"] == ToolStatuses.READY):
            if callback:
                callback(tool)
            self._send_client_message(ClientMessages.TOOL_HEATING)
            return

        if callback:
            with self.heating_callback_mutex:
                self.heating_callbacks.append(callback)

        self._printer.set_temperature(tool, temp)
        self._send_client_message(ClientMessages.TOOL_HEATING)

    def _get_tool_num(self, tool):
        if tool == "bed":
            tool_num = 2
        else:
            tool_num = int(tool[len("tool"):])

        return tool_num

    ##~ Printer Control functions
    def _move_to_bed_maintenance_position(self):
        """
        Moves bed to cleaning position
        """
        self._set_movement_mode("absolute")
        self._execute_printer_script("bed_maintenance_position")
        self.restore_movement_mode()

    def _set_movement_mode(self, mode):
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
        self._set_movement_mode(self.last_movement_mode)

    def restore_extrusion_mode(self):
        self.set_extrusion_mode(self.last_extrusion_mode)

    def restore_z_after_filament_load(self):
       if(self.z_before_filament_load is not None):
            self._printer.commands(["G1 Z%f F1200" % self.z_before_filament_load])

    def move_to_filament_load_position(self, tool = None):
        self._logger.debug('move_to_filament_load_position')
        self._set_movement_mode("absolute")

        self.z_before_filament_load = self._printer._currentZ

        context = { "currentZ": self._printer._currentZ,
                    "stepperTimeout": self.current_printer_profile["filament"]["stepperTimeout"] if "stepperTimeout" in self.current_printer_profile["filament"] else None,
                    "filamentChangeTool": self._get_tool_num(tool) if tool else 0
                    }

        self._execute_printer_script("filament_load_position", context)

        self.restore_movement_mode()

    def _on_powerbutton_press(self):
        self._send_client_message(ClientMessages.POWERBUTTON_PRESSED)

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

    def _get_material_from_name(self, material_profile_name):
        """
        Gets the material profile for a given material name. Returns None if it is not found.
        """
        self._logger.debug("Looking for material {0}".format(material_profile_name))
        
        if material_profile_name == self.default_material_name:
            return None
        
        profiles = self._settings.global_get(["temperature", "profiles"])
        for profile in profiles:
            if profile['name'] == material_profile_name:
                return profile

    def _on_media_folder_updated(self, event):
        was_media_mounted = self.is_media_mounted

        # Check if there's something mounted in media_dir
        def get_immediate_subdirectories(a_dir):
            return [name for name in os.listdir(a_dir)
                if os.path.isdir(os.path.join(a_dir, name))]

        number_of_dirs = 0

        try:
            number_of_dirs = len(get_immediate_subdirectories(self.media_folder)) > 0
        except:
            self._logger.warning("Could not read USB")
            self._send_client_message(ClientMessages.MEDIA_FOLDER_UPDATED, { "isMediaMounted": False, "error": True })
            return

        if(event is None or (number_of_dirs > 0 and not was_media_mounted) or (number_of_dirs == 0 and was_media_mounted)):
            # If event is None, it's a forced message
            self._send_client_message(ClientMessages.MEDIA_FOLDER_UPDATED, { "isMediaMounted": number_of_dirs > 0 })

        self.is_media_mounted = number_of_dirs > 0

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
        self._logger.info("M115 data received: %s" % line)
        line = line[5:].rstrip() # Strip echo and newline

        if len(line) > 0:
            oldModelName = self.model.lower() if self.model else None
            self._update_from_m115_properties(line)
            self.machine_info = self._get_machine_info()

            self.model = self.machine_info["machine_type"].lower() if "machine_type" in self.machine_info and self.machine_info["machine_type"] else "unknown"

            if not self.model in self.supported_models:
                self._logger.warn('Model {0} not found. Defaulting to {1}'.format(self.model, self.default_model))
                self.model = self.default_model

            if oldModelName != self.model:
                self._logger.debug("Printer model changed. Old model: {0}. New model: {1}".format(oldModelName, self.model))
                self._update_printer_scripts_profiles()
                self._init_model()

            self._call_hooks(self.firmware_info_received_hooks)
            self._send_client_message(ClientMessages.MACHINE_INFO_UPDATED, self.machine_info)

    def _update_from_m115_properties(self, line):

        port, _ = self._printer._comm.getConnection()

        if port == "VIRTUAL":
            line = self.virtual_m115
            self.is_virtual = True
            self._logger.debug("Virtual port detected. Assuming virtual M115 line")

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
                self.machine_database.update({'value': None }, self._machine_query.property == key)


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
        self._send_client_message(ClientMessages.PRINTER_ERROR_REASON_UPDATE, { 'printer_error_reason': self.printer_error_reason, 'printer_error_extruder': self.printer_error_extruder })

    def _reset_printer_error(self):
        self._logger.debug('Clearing printer error')
        self.printer_error_reason = None
        self.printer_error_extruder = None

    def _set_print_mode(self, print_mode):
        self.print_mode = print_mode
        self._printer.commands(["M605 S{0}".format(print_mode)])

    def _reset_current_print_extrusion_amount(self):
        for tool in self.tools:
            self.tools[tool]["current_print_extrusion_amount"] = 0.0

    ##~ OctoPrint EventHandler Plugin
    def on_event(self, event, payload, *args, **kwargs):
        was_calibration = self.calibration_type
        if self.calibration_type:
            self._on_calibration_event(event)

        if (event == Events.PRINT_CANCELLED or event == Events.PRINT_DONE or event == Events.ERROR):
            self._reset_current_print_extrusion_amount()
            self._save_filament_to_db()
            # TODO: Move commands below to gcode script
            self._set_print_mode(PrintModes.NORMAL)

            if "boundaries" in self.current_printer_profile and "maxZ" in self.current_printer_profile["boundaries"]:
               maxZ = self.current_printer_profile["boundaries"]["maxZ"]
            else:
               maxZ = 20

            if self._printer._currentZ < maxZ:
                self._printer.jog({ 'z': 20 })

            self._printer.home(['x', 'y'])

        if (event == Events.PRINT_DONE and self.auto_shutdown and not was_calibration):
            config = self._settings.global_get(["webcam", "timelapse"], merged=True)
            type = config["type"]
            self._send_client_message(ClientMessages.AUTO_SHUTDOWN_START)
            # Timelapse not configured, just start the timer
            if type is None or "off" == type:
                self._logger.info("Print done, no timelapse configured and auto shutdown on. Starting shutdown timer.")
                # Start auto shutdown timer
                self._auto_shutdown_start()
            else:
                # Timelapse is configured, let's not do anything and shutdown after render complete or failed
                self._send_client_message(ClientMessages.AUTO_SHUTDOWN_WAIT_ON_RENDER)
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
            self._reset_current_print_extrusion_amount()

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
            self._set_print_mode(PrintModes.NORMAL)

            if self.connecting_after_maintenance:
                self.connecting_after_maintenance = False
                self._auto_home_after_maintenance()

        if(event == Events.DISCONNECTED):
            if self.powerdown_after_disconnect:
                self.powerdown_after_disconnect = False
                self._do_powerdown_after_disconnect()

        if(event == Events.ERROR or event == Events.DISCONNECTED):
            self._handle_error_and_disconnect(event, payload)

        if(event == Events.PRINT_PAUSED):
            # Make a copy of current parameters, to be restored after a filament swap
            self.paused_temperatures = deepcopy(self.current_temperature_data)
            self.paused_materials = self._get_current_materials()
            self.paused_print_mode = self.print_mode
            self.paused_position = payload["position"] # Containts x,y,z,e,f,t(ool)

        if (event == Events.SETTINGS_UPDATED):
            self._update_hostname()

    def _update_hostname(self):
        """ Updates the hostname of the environment"""

        # If hostname is None, we couldn't even read the hostname, so let alone write it
        if self.hostname:
            new_name = self._settings.global_get(["appearance", "name"])

            if new_name:
                new_hostname = self._transform_hostname(new_name)
            
                if new_hostname != self.hostname:
                    self._save_hostname(new_hostname)

    def _save_hostname(self, new_hostname):
        """Saves the hostname to the /etc/hostname file and replaces any occurences in /etc/hosts"""
        if self.hostname:
            # We need admin rights for this, so sudo a command, and in one go because sudo depends on hostname
            command = "sudo -s -- sh -c \"hostname '{hostname}' && echo '{hostname}' > /etc/hostname && sed -i 's@127.0.1.1\(.*\)@127.0.1.1      {hostname}@g' /etc/hosts\"".format(hostname=new_hostname)
            try:
                octoprint_lui.util.execute(command)
            except octoprint_lui.util.ScriptError as e:
                self._logger.warn("Could not save hostname {0}: {1} - {2}".format(new_hostname, e.stdout, e.stderr))
                return False

            # Check returncodes
            self.hostname = new_hostname
            self._logger.info("Hostname updated: {0}".format(self.hostname))
            return True

    def _transform_hostname(self, pretty_name):
        """
        Transforms any given unicode pretty_name into a fqdn
        """
        if not pretty_name:
            return None

        # Make it basic ascii
        pretty_name = pretty_name.encode('ascii','ignore')

        # Replace spaces and underscores with hyphens
        pretty_name = pretty_name.replace(" ", "-").replace("_", "-")

        # Remove everything that isn't 0-9a-zA-Z-.
        pretty_name = re.sub("[^0-9a-zA-Z-.]", "", pretty_name)

        # Trim up to 253 chars
        if len(pretty_name) > 253:
            pretty_name = pretty_name[:253]

        # Ensure each part (splitted by .) is at most 63 chars
        splitted = pretty_name.split(".")
        new_pretty_name = ""
        for p in splitted:
            np = p.lstrip("-0123456789").rstrip("-")
            if len(np) > 63:
                new_pretty_name += "." + np[:63]
            elif len(np) >= 1:
                new_pretty_name += "." + np

        pretty_name = new_pretty_name[1:]

        return pretty_name

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
        self._send_client_message(ClientMessages.AUTO_SHUTDOWN_TIMER, { "timer": self.auto_shutdown_timer_value })

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
