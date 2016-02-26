from __future__ import absolute_import

import flask
import logging
import time
import threading
import re

import octoprint.plugin
from octoprint.settings import settings

from octoprint.util import RepeatedTimer

class LUIPlugin(octoprint.plugin.UiPlugin,
                octoprint.plugin.TemplatePlugin,
                octoprint.plugin.AssetPlugin,
                octoprint.plugin.SimpleApiPlugin,
				octoprint.plugin.SettingsPlugin,
				octoprint.plugin.EventHandlerPlugin):

	def __init__(self):
		_s = settings();

		self.time_out = 10
		self.unloading_time_out = 3
		self.isLoading = False
		self.loading_filament = None
		self.unloading_filament = None
		self.start_time = None
		self.current_print_extrusion_amount = 0.0
		self.last_print_extrusion_amount = 0.0

		self.last_extrusion = 0
		self.current_extrusion = 0

		self.materials = _s.get(["temperature", "profiles"])
		self.defaultMaterial = {
				"bed": 0,
				"extruder": 0,
				"name": "None"
			}

		self.filamentDefaults = [
			{
				"amountLeft": 0,
				"material": self.defaultMaterial
			},
			{
				"amountLeft": 300000,
				"material": self.defaultMaterial
			}
		]

		self.regexExtruder = re.compile("(^|[^A-Za-z][Ee])(-?[0-9]*\.?[0-9]+)")

	def get_settings_defaults(self):
		return dict(
			filaments=self.filamentDefaults,
			lpfrg_model= "Xeed"
		)


	def get_api_commands(self):
			return dict(
					start_loading=["tool"],
                    start_unloading=["tool"],
					stop_loading=[]
			) 

	def on_api_command(self, command, data):
			import flask
			if command == "start_loading":
				if self.loading_filament is None:
					self.isLoading = True
					if "tool" in data:
						tool = data["tool"]
					self._logger.info(tool)
					self._printer.change_tool(tool)
					self._printer.commands(["G91", "M302"]) #HACK TO TEST TODO
					self.loading_filament = RepeatedTimer(0.2, self.loadingTimer, run_first=True, on_finish=self.loadingFinished)
					self.start_time = time.time()
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
					self.unloading_filament = RepeatedTimer(0.2, self.unloadingTimer, run_first=True, on_finish=self.unloadingFinished)
					self.start_time = time.time()
					self.unloading_filament.start()
					self._send_client_message("unloading_filament_start")
					self._logger.info("Unloading started")
			elif command == "stop_loading":
				if self.loading_filament is not None:
					self.loading_filament.cancel()
					self._logger.info("Stop loading command received")
			
	def will_handle_ui(self, request):
		return True

	def on_ui_render(self, now, request, render_kwargs):
		from flask import render_template, make_response
		return make_response(render_template("index_lui.jinja2", **render_kwargs))

	def _send_client_message(self, message_type, data=None):
			self._plugin_manager.send_plugin_message("lui", dict(type=unicode(message_type, errors='ignore'), data=data))

	def loadingTimer(self):
		if self.start_time is not None:
			self.now = time.time()
			if self.now - self.start_time > self.time_out:
				self.loading_filament.cancel()
				self._logger.info("Loading stopped due to timer hit")
		self._printer.extrude(1)

	def unloadingTimer(self):
		if self.start_time is not None:
			self.now = time.time()
			if self.now - self.start_time > self.unloading_time_out:
				self.unloading_filament.cancel()
				self._logger.info("Unloading stopped")
		self._printer.extrude(-1)

	def loadingFinished(self):
		self._printer.commands("G90")
		self.isLoading = False
		self.loading_filament = None
		self._send_client_message("loading_filament_stop")
		self._printer.change_tool("tool0") # Always set tool back to right extruder
		self._logger.info("Loading finished")

	def unloadingFinished(self):
		self._printer.commands("G90")
		self.isLoading = False
		self.unloading_filament = None
		self._send_client_message("unloading_filament_stop")
		self._printer.change_tool("tool0") # Always set tool back to right extruder
		self._logger.info("Unloading finished")

	def checkExtrusion(self, comm_instance, phase, cmd, cmd_type, gcode, *args, **kwargs):
		if gcode:
			if gcode == "G92":
				if self.regexExtruder.search(cmd):
					self.last_extrusion = 0
					self._logger.info("Extruder zero: %s" % cmd)
			if (gcode == "G0" or gcode =="G1") and comm_instance.isPrinting():
				extrusion_code = self.regexExtruder.search(cmd)
				if extrusion_code is not None:
					current_extrusion = float(extrusion_code.group(2))
					extrusion_amount = current_extrusion - self.last_extrusion
					self.current_print_extrusion_amount += extrusion_amount
					self.filamentDefaults[comm_instance.getCurrentTool()]["amountLeft"] -= extrusion_amount
					self._logger.info("Filament left :%f" % self.filamentDefaults[comm_instance.getCurrentTool()]["amountLeft"])
					self._logger.info("Extrusion amount:%f" % self.current_print_extrusion_amount)
					self.last_extrusion = current_extrusion
					# self._logger.info("Exrusion amount:%f" % extrusion_amount)

		

	def on_event(self, event, playload, *args, **kwargs):
		if (event == "PrintFailed" or event == "PrintCanceled" or event == "PrintDone"):
			self.last_print_extrusion_amount = self.current_print_extrusion_amount
			self.current_print_extrusion_amount = 0.0
		if (event == "PrintStarted"):
			self.current_print_extrusion_amount = 0.0


__plugin_name__ = "lui"
def __plugin_load__():
	global __plugin_implementation__
	__plugin_implementation__ = LUIPlugin()

	global __plugin_hooks__ 
	__plugin_hooks__ = {
		"octoprint.comm.protocol.gcode.sent": __plugin_implementation__.checkExtrusion
	}
