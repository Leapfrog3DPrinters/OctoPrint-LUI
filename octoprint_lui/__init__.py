from __future__ import absolute_import

import logging
import time
import threading
import re
import subprocess

from pipes import quote

from functools import partial

from copy import deepcopy
from flask import jsonify, make_response, render_template
import octoprint.plugin

from octoprint.settings import settings
from octoprint.util import RepeatedTimer
from octoprint.util import dict_merge


class LUIPlugin(octoprint.plugin.UiPlugin,
                octoprint.plugin.TemplatePlugin,
                octoprint.plugin.AssetPlugin,
                octoprint.plugin.SimpleApiPlugin,
				octoprint.plugin.SettingsPlugin,
				octoprint.plugin.EventHandlerPlugin):

	def __init__(self):

		self.time_out = 10
		self.unloading_time_out = 3
		self.isLoading = False
		self.loading_filament = None
		self.unloading_filament = None
		self.start_time = None
		self.current_print_extrusion_amount = None
		self.last_print_extrusion_amount = 0.0
		self.last_send_extrusion_amount = None
		self.last_saved_extrusion_amount = None
		self.loadingAmount = 0

		self.update_info = [
			{
				'identifier': 'octoprint_lui',
				'path': '/Users/pim/lpfrg/OctoPrint-LUI',
				'update': False,
				'action': 'update_lui'
			},
			{
				'identifier': 'octoprint_networkmanager',
				'path': '/Users/pim/lpfrg/OctoPrint-NetworkManager',
				'update': False,
				'action': 'update_networkmanager'
			},			{
				'identifier': 'octoprint',
				'path': '/Users/pim/lpfrg/OctoPrint',
				'update': False,
				'action': 'update_octoprint'
			}
			]

		self.last_extrusion = 0
		self.current_extrusion = 0

		self.filament_amount = None 

		self.defaultMaterial = {
				"bed": 0,
				"extruder": 0,
				"name": "None"
			}

		self.filamentDefaults = {
				"tool0": {
					"amount": {
						"length": 0, "volume": 0
					},
					"material": self.defaultMaterial
				},
				"tool1": {
					"amount":{
						"length": 0, "volume": 0
					},
					"material": self.defaultMaterial
				} 
			}

		self.regexExtruder = re.compile("(^|[^A-Za-z][Ee])(-?[0-9]*\.?[0-9]+)")

	def initialize(self):
		self.materials = self._settings.global_get(["temperature", "profiles"])
		self._logger.info(self._settings.get(["filaments"]))
		filaments = self._settings.get(["filaments"])
		self.filament_amount = [filaments["tool"+str(index)]["amount"]["length"] for index, data in enumerate(filaments)]
		self._logger.info(self.filament_amount)

		self.last_send_filament_amount = deepcopy(self.filament_amount)
		self.last_saved_filament_amount = deepcopy(self.filament_amount)
		self.current_print_extrusion_amount = [0.0,0.0]

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

		self._settings.global_set(["system", "actions"], actions)
		self._logger.info(self._settings.global_get(["system", "actions"]))

		## Lets check for updates on our stuff

		for update in self.update_info:
			update['update'] = self.check_for_update(update['path'])


		self._logger.info(self.update_info)

	def check_for_update(self, path):
		# First fetch the repo
		self.fetch_git_repo(path)
		if self.is_update_needed(path):
			return True


	def is_update_needed(self, path):
		local = subprocess.check_output(['git', 'rev-parse', '@'], cwd=path)
		remote = subprocess.check_output(['git', 'rev-parse', '@{upstream}'], cwd=path)
		base = subprocess.check_output(['git', 'merge-base', '@', '@{u}'], cwd=path)

		if (local == remote):
			##~ Remote and local are the same, git is up-to-date
			self._logger.info("Git with path: {path} is up-to-date".format(path=path))
			return True #Testing
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
		return dict(
			filaments=self.filamentDefaults,
			lpfrg_model= "Xeed"
		)

	def on_api_get(self, request):
		return jsonify(dict(
			update=self.update_info
			))

	def get_api_commands(self):
			return dict(
					start_loading=["tool", "amount"],
                    start_unloading=["tool"],
					stop_loading=[],
					update_filament = ["tool", "amount"]
			) 

	def on_api_command(self, command, data):
			if command == "start_loading":
				if self.loading_filament is None:
					self.isLoading = True
					if "tool" in data:
						tool = data["tool"]
					if "amount" in data:
						amount = data["amount"]
					self._logger.info(tool)
					self._printer.change_tool(tool)
					self._printer.commands(["G91", "M302"]) #HACK TO TEST TODO
					self.start_time = time.time()
					loadingFinishedPartial = partial(self.loadingFinished, tool=tool, amount=amount)
					self.loading_filament = RepeatedTimer(0.2, self.loadingTimer, run_first=True, on_finish=loadingFinishedPartial)
					self.loading_filament.start()
					self._send_client_message("loading_filament_start")
					self._logger.info("Loading started")
			elif command == "start_unloading":
				if self.unloading_filament is None:
					self.isLoading = True
					if "tool" in data:
						tool = data["tool"]
					self._logger.info(tool)
					self._printer.change_tool(tool)
					self._printer.commands(["G91", "M302"]) #HACK TO TEST TODO
					self.start_time = time.time()
					self.unloading_filament = RepeatedTimer(0.2, self.unloadingTimer, run_first=True, on_finish=self.unloadingFinished)
					self.unloading_filament.start()
					self._send_client_message("unloading_filament_start")
					self._logger.info("Unloading started")
			elif command == "stop_loading":
				if self.loading_filament is not None:
					self.loading_filament.cancel()
					self._logger.info("Stop loading command received")
					self._logger.info(self._settings.get(["filaments"]))
			elif command == "update_filament":
				tool = data["tool"]
				tool_num = int(tool[len("tool"):])
				self.filament_amount[tool_num] = data["amount"]
				self.save_filament_amount()
				self.send_filament_amount()


			
	def will_handle_ui(self, request):
		return True

	def on_ui_render(self, now, request, render_kwargs):
		return make_response(render_template("index_lui.jinja2", **render_kwargs))

	def _send_client_message(self, message_type, data=None):
			self._plugin_manager.send_plugin_message("lui", dict(type=unicode(message_type, errors='ignore'), data=data))

	def loadingTimer(self):
		if self.start_time is not None:
			self.now = time.time()
			if self.now - self.start_time > self.time_out:
				self.loading_filament.cancel()
				self._logger.info("Loading stopped due to timer hit")
				self.start_time = None
				self.loading_filament = None
		self._printer.extrude(1)

	def unloadingTimer(self):
		if self.start_time is not None:
			self.now = time.time()
			if self.now - self.start_time > self.unloading_time_out:
				self.unloading_filament.cancel()
				self._logger.info("Unloading stopped")
				self.start_time = None
		self._printer.extrude(-1)

	def loadingFinished(self, tool, amount):
		self._printer.commands("G90")
		self.isLoading = False
		tool_num = int(tool[len("tool"):])
		self.filament_amount[tool_num] = amount
		self.save_filament_amount(tool)
		self.send_filament_amount()
		self.loading_filament = None
		self._send_client_message("loading_filament_stop")
		self._printer.change_tool("tool0") # Always set tool back to right extruder
		self._logger.info("Loading finished")
		self._logger.info(self._settings.get(["filaments"]))


	def unloadingFinished(self):
		self._printer.commands("G90")
		self.isLoading = False
		self.unloading_filament = None
		self._send_client_message("unloading_filament_stop")
		self._printer.change_tool("tool0") # Always set tool back to right extruder
		self._logger.info("Unloading finished")

	def save_filament_amount(self, tool):
		tool_num = int(tool[len("tool"):])
		current = self._settings.get(["filaments"])
		current[tool]["amount"]["length"] = self.filament_amount[tool_num]
		self._logger.info(current)
		self._settings.set(["filaments"], current, force=True)
		self._settings.save(force=True)

	def checkExtrusion(self, comm_instance, phase, cmd, cmd_type, gcode, *args, **kwargs):
		if gcode:
			if gcode == "G92":
				if self.regexExtruder.search(cmd):
					self.last_extrusion = 0
					self._logger.info("Extruder zero: %s" % cmd)
			if (gcode == "G0" or gcode =="G1") and comm_instance.isPrinting():
				extrusion_code = self.regexExtruder.search(cmd)
				if extrusion_code is not None:
					tool = comm_instance.getCurrentTool()
					current_extrusion = float(extrusion_code.group(2))
					extrusion_amount = current_extrusion - self.last_extrusion
					self.current_print_extrusion_amount[tool] += extrusion_amount
					self.filament_amount[tool] -= extrusion_amount
					self.last_extrusion = current_extrusion
					if (self.last_send_filament_amount[tool] - self.filament_amount[tool] > 10):
						self.send_filament_amount()
						self.last_send_filament_amount = deepcopy(self.filament_amount)
					if (self.last_saved_filament_amount[tool] - self.filament_amount[tool] > 100):
						self.save_filament_amount()
						self.last_saved_extrusion_amount = deepcopy(self.filament_amount)



	def send_filament_amount(self):
		filament_length = [{"length":x} for x in self.filament_amount]
		data = {"extrusion": self.current_print_extrusion_amount, "filament": filament_length}
		self._send_client_message("update_filament_amount", data)


	def on_event(self, event, playload, *args, **kwargs):
		if (event == "PrintFailed" or event == "PrintCanceled" or event == "PrintDone" or event == "Error"):
			self.last_print_extrusion_amount = self.current_print_extrusion_amount
			self.current_print_extrusion_amount = 0.0
			self.save_filament_amount()
			self._settings.save(force=True)


		if (event == "PrintStarted"):
			self.current_print_extrusion_amount = [0.0, 0.0]


__plugin_name__ = "lui"
def __plugin_load__():
	global __plugin_implementation__
	__plugin_implementation__ = LUIPlugin()

	global __plugin_hooks__ 
	__plugin_hooks__ = {
		"octoprint.comm.protocol.gcode.sent": __plugin_implementation__.checkExtrusion
	}
