from __future__ import absolute_import

import flask
import logging
import time
import threading

import octoprint.plugin

from octoprint.util import RepeatedTimer

class LUIPlugin(octoprint.plugin.UiPlugin,
                octoprint.plugin.TemplatePlugin,
                octoprint.plugin.AssetPlugin,
                octoprint.plugin.SimpleApiPlugin):

	def __init__(self):
		self.time_out = 12
		self.isLoading = False
		self.loading_filament = None
		self.start_time = None


	def get_settings_defaults(self):
		return dict(
			left_material=None,
			right_material=None
		)

	def get_api_commands(self):
			return dict(
					start_loading=["tool"],
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
			self._plugin_manager.send_plugin_message("lui", dict(type=message_type, data=data))

	def loadingTimer(self):
		if self.start_time is not None:
			self.now = time.time()
			if self.now - self.start_time > self.time_out:
				self.loading_filament.cancel()
				self._logger.info("Loading stopped due to timer hit")
		self._printer.extrude(1)

	def loadingFinished(self):
		self._printer.commands("G90")
		self.isLoading = False
		self.loading_filament = None
		self._send_client_message("loading_filament_stop")
		self._printer.change_tool("tool0") # Always set tool back to right extruder
		self._logger.info("Loading finished")



__plugin_name__ = "lui"
def __plugin_load__():
	global __plugin_implementation__
	__plugin_implementation__ = LUIPlugin()