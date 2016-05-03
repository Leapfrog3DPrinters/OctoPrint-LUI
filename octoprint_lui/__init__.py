# coding=utf-8
from __future__ import absolute_import

import logging
import time
import threading
import re
import subprocess
import threading
import netaddr
import os

from pipes import quote
from functools import partial
from copy import deepcopy
from flask import jsonify, make_response, render_template, request

from tinydb import TinyDB, Query 

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
                octoprint.printer.PrinterCallback):

    def __init__(self):

        ##~ Filament loading variables
        self.relative_extrusion = False
        self.current_print_extrusion_amount = None
        self.last_print_extrusion_amount = 0.0
        self.last_send_filament_amount = None
        self.last_saved_filament_amount = None
        
        self.last_extrusion = 0
        self.current_extrusion = 0

        self.filament_amount = None 

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

        ##~ TinyDB 

        self.filament_database_path = None
        self.filament_query = None
        self.filament_database = None


        ##~ Update software init
        self.last_git_fetch = 0
        self.update_info = [
            {
                'identifier': 'lui',
                'path': '/home/lily/OctoPrint-LUI',
                'update': False,
                'action': 'update_lui',
                'name': "Leapfrog UI",
                'version': "testing"
            },
            {
                'identifier': 'networkmanager',
                'path': '/home/lily/OctoPrint-NetworkManager',
                'update': False,
                'action': 'update_networkmanager',
                'name': 'Network Manager',
                'version': "0.0.1"
            },
            {
                'identifier': 'flasharduino',
                'path': '/home/lily/OctoPrint-flashArduino',
                'update': False,
                'action': 'update_flasharduino',
                'name': 'Flash Firmware Module',
                'version': "0.0.1"
            },      
            {
                'identifier': 'octoprint',
                'path': '/home/lily/OctoPrint',
                'update': False,
                'action': 'update_octoprint',
                'name': 'OctoPrint',
                'version': VERSION
            }
            ]

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


    def initialize(self):
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
                "command": "cd /home/lily/OctoPrint-LUI && git pull && /home/lily/OctoPrint/venv/bin/python setup.py install",
                "confirm": False
            }
            actions.append(update_lui)

        ## Add update network manager to the actions
        if not is_variable_in_dict('update_networkmanager', actions):
            update_networkmanager = {
                "action": "update_networkmanager",
                "name": "Update NetworkManager",
                "command": "cd /home/lily/OctoPrint-NetworkManager && git pull && /home/lily/OctoPrint/venv/bin/python setup.py install",
                "confirm": False
            }
            actions.append(update_networkmanager)

        ## Add update OctoPrint core to the actions
        if not is_variable_in_dict('update_octoprint', actions):
            update_octoprint = {
                "action": "update_octoprint",
                "name": "Update OctoPrint",
                "command": "cd /home/lily/OctoPrint && git pull && /home/lily/OctoPrint/venv/bin/python setup.py install",
                "confirm": False
            }
            actions.append(update_octoprint)

        ## Add update flasharduino to the actions
        if not is_variable_in_dict('update_flasharduino', actions):
            update_flasharduino = {
                "action": "update_flasharduino",
                "name": "Update Flash Firmware Module",
                "command": "cd /home/lily/OctoPrint-flashArduino && git pull && /home/lily/OctoPrint/venv/bin/python setup.py install",
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

        self.update_info_list()

        self._logger.info(self.update_info)

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
        try:
            output = subprocess.check_output(['git', 'fetch'],cwd=path)
        except subprocess.CalledProcessError as err:
            self._logger.warn("Can't fetch git with path: {path}. {err}".format(path=path, err=err))
        self._logger.debug("Fetched git repo: {path}".format(path=path))

    def get_settings_defaults(self):
        return {
            "model": "Xeed",
            "zoffset": 0,
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

        response = make_response(render_template("index_lui.jinja2", local_addr=from_localhost, **render_kwargs))

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
    def on_api_get(self, request):
        return jsonify(dict(
            update=self.update_info,
            filaments=self.filament_database.all()
            ))

    def get_api_commands(self):
            return dict(
                    change_filament=["tool"],
                    unload_filament=[],
                    load_filament=["profile", "amount"],
                    cancel_change_filament=[],
                    update_filament = ["tool", "amount"],
                    refresh_update_info = []
            ) 

    def on_api_command(self, command, data):
        self._call_api_method(**data)

    def _on_api_command_change_filament(self, tool, *args, **kwargs):
        # Send to the front end that we are currently changing filament.
        self.send_client_in_progress()
        # Set filament change tool and profile
        self.filament_change_tool = tool
        self.filament_loaded_profile = self.filament_database.get(self.filament_query.tool == tool)
        self._printer.change_tool(tool)

        # Check if filament is loaded, if so report to front end. 
        if (self.filament_loaded_profile['material']['name'] == 'None'):
            # No filament is loaded in this tool, directly continue to load section
            self.send_client_skip_unload();

        self._logger.info("Change filament called with tool: {tool} and {args}, {kwargs}".format(tool=tool, args=args, kwargs=kwargs))

    def _on_api_command_unload_filament(self, *args, **kwargs):
        # Heat up to old profile temperature and unload filament
        temp = int(self.filament_loaded_profile['material']['extruder'])
        self.heat_to_temperature(self.filament_change_tool, 
                                temp, 
                                self.unload_filament)
        self._logger.info("Unload filament called with {args}, {kwargs}".format(args=args, kwargs=kwargs))

    def _on_api_command_load_filament(self, profile, amount, *args, **kwargs):
        # Heat up to new profile temperature and load filament
        self.filament_change_profile = profile
        if (profile['name'] == "None"):
            # The user wants to load a None profile. So we just finish the swap wizard
            self.send_client_finished()
            return None
        self.filament_change_amount = amount 
        temp = int(profile['extruder'])
        self.heat_to_temperature(self.filament_change_tool, 
                                temp, 
                                self.load_filament)
        self._logger.info("Load filament called with profile {profile}, amount {amount}, {args}, {kwargs}".format(profile=profile, amount=amount, args=args, kwargs=kwargs))

    def _on_api_command_cancel_change_filament(self, *args, **kwargs):
        # Abort mission! Stop filament loading.
        # Cancel all heat up and reset
        # Loading has already started, so just cancel the loading 
        # which will stop heating already.
        if self.load_filament_timer:
            self.load_filament_timer.cancel()
        # Other wise we haven't started loading yet, so cancel the heating 
        # and clear all callbacks added to the heating. 
        else:
            with self.callback_mutex:
                del self.callbacks[:]
            self._printer.set_temperature(self.filament_change_tool, 0)
            self.send_client_cancelled()
        self._logger.info("Cancel change filament called with {args}, {kwargs}".format(args=args, kwargs=kwargs))

    def _on_api_command_update_filament(self, *args, **kwargs):
        # Update the filament amount that is logged in tha machine
        self._logger.info("Update filament amount called with {args}, {kwargs}".format(args=args, kwargs=kwargs))

    def _on_api_command_refresh_update_info(self, *args, **kwargs):
        # Force refresh update info
        self._logger.info("Refresh update info: {kwargs}".format(kwargs=kwargs))
        self.update_info_list(force=True)

    def on_api_move_to_filament_load_position(self, *args, **kwargs):
        self.move_to_filament_load_position()

    def on_api_move_to_maintenance_position(self, *args, **kwargs):
        self.move_to_maintenance_position()

    ##~ Load and Unload methods

    def load_filament(self, tool):
        ## This is xeed load function, TODO: Bolt! function and switch
        self.load_amount = 0

        # We can set one change of extrusion and speed during the timer
        # Start with load_initial and change to load_change at load_change['start']
        load_initial=dict(amount=16.67, speed=2000)
        load_change=dict(start=1900, amount=2.5, speed=300)

        # Total amount being loaded
        self.load_amount_stop = 2100
        self.move_to_filament_load_position()
        self._printer.commands("G91")
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
        ## This is xeed load function, TODO: Bolt! function and switch
        self.load_amount = 0

        # We can set one change of extrusion and speed during the timer
        # Start with load_initial and change to load_change at load_change['start']
        unload_initial=dict(amount= -2.5, speed=300)
        unload_change=dict(start=30, amount= -16.67, speed=2000)

        # Total amount being loaded
        self.load_amount_stop = 2100
        self._printer.commands("G91")
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
        # Loading is finished, turn off heaters, reset load timer and back to normal movements
        self._printer.commands("G90")
        self._printer.set_temperature(self.filament_change_tool, 0)
        self.load_filament_timer = None

    def _unload_filament_finished(self):
        # Loading is finished, turn off heaters, reset load timer and back to normal movements
        self._printer.commands("G90")
        self.load_filament_timer = None

    def _load_filament_cancelled(self):
        # A load or unload action has been cancelled, turn off the heating
        # send cancelled info.
        self._printer.set_temperature(self.filament_change_tool, 0)
        self.send_client_cancelled()

    ##~ Helpers to send client messages
    def _send_client_message(self, message_type, data=None):
        self._plugin_manager.send_plugin_message(self._identifier, dict(type=message_type, data=data))

    def send_client_heating(self):
        self._send_client_message('tool_heating')

    def send_client_loading(self):
        self._send_client_message('filament_loading')

    def send_client_loading_progress(self, data):
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
        if not script_type == "gcode":
            return None
    
        if script_name == "beforePrintStarted":
            return ["M206 Z%.2f" % self._settings.get_float(["zoffset"])], None

        if script_name == "afterPrinterConnected":
            return ["M206 Z%.2f" % self._settings.get_float(["zoffset"])], None

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
            if gcode == "G92":
                self._process_G92(cmd)

            ##~ For now only handle extrusion when actually printing a job
            if (gcode == "G0" or gcode =="G1") and comm_instance.isPrinting():
                self._process_G0_G1(cmd, comm_instance)

    def _process_G90_G91(self, cmd):
        ##~ Process G90 and G91 commands. Handle relative extrusion
        if cmd == "G90":
            self.relative_extrusion = False
        else:
            self.relative_extrusion = True

    def _process_G92(self, cmd):
        ##~ Process a G92 command and handle zero-ing of extrusion distances
        if self.regexExtruder.search(cmd):
            self.last_extrusion = 0
            self._logger.info("Extruder zero: %s" % cmd)

    def _process_G0_G1(self, cmd, comm_instance):
        ##~ Process a G0/G1 command with extrusion
        extrusion_code = self.regexExtruder.search(cmd)
        if extrusion_code is not None:
            tool = comm_instance.getCurrentTool()
            current_extrusion = float(extrusion_code.group(2))
            # Handle relative vs absolute extrusion
            if self.relative_extrusion:
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
        with self.callback_mutex:
            self.callbacks.append(callback)
        self._printer.set_temperature(tool, temp)
        self.send_client_heating()

    ##~ Printer Control functions
    def move_to_maintenance_position(self):
        # First home X and Y 
        self._printer.home(['x', 'y'])
        self._printer.commands(["G1 X115 Y15 F6000"]) 

    def move_to_filament_load_position(self):
        # First home X and Y 
        self._printer.home(['x', 'y'])
        self._printer.commands(["G1 X210 Y0 F6000"]) 


    ##~ OctoPrint EventHandler Plugin
    def on_event(self, event, playload, *args, **kwargs):
        if (event == "PrintFailed" or event == "PrintCancelled" or event == "PrintDone" or event == "Error"):
            self.last_print_extrusion_amount = self.current_print_extrusion_amount
            self.current_print_extrusion_amount = 0.0
            self.save_filament_amount()
            self._settings.save(force=True)

        if (event == "PrintStarted"):
            self.current_print_extrusion_amount = [0.0, 0.0]

    ##~ Helper method that calls api defined functions
    def _call_api_method(self, command, *args, **kwargs):
        """Call the method responding to api command"""
        name = "_on_api_command_{}".format(command)
        method = getattr(self, name, None)
        if method is not None and callable(method):
            method(*args, **kwargs)


__plugin_name__ = "Leapfog UI"
def __plugin_load__():
    global __plugin_implementation__
    __plugin_implementation__ = LUIPlugin()

    global __plugin_hooks__ 
    __plugin_hooks__ = {
        "octoprint.comm.protocol.gcode.sent": __plugin_implementation__.gcode_sent_hook,
        "octoprint.comm.protocol.scripts": __plugin_implementation__.script_hook
    }
