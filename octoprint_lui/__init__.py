import octoprint.plugin

class LUIPlugin(octoprint.plugin.UiPlugin,
                       octoprint.plugin.TemplatePlugin,
                       octoprint.plugin.AssetPlugin):

	def get_assets(self):
		return dict(
			js=["js/viewmodel.js"]
		)

	def get_settings_defaults(self):
		return dict(
			left_material=None,
			right_material=None
		)


	def add_template_type(self, template_sorting, template_rules, *args, **kwargs):
		return [
			("flyout", dict(), dict(template=lambda x: x + "_flyout.jinja2"))
		]

	def get_template_configs(self):
		return [
			dict(type="plugin_lui_flyout", template="flyouts_lui/settings_flyouts/materials_flyout.jinja2", name="Materials", div="materials"),
			dict(type="plugin_lui_flyout", template="flyouts_lui/settings_flyouts/printer_flyout.jinja2", name="Printer", div="printer")
		]


	def will_handle_ui(self, request):
		return True

	def on_ui_render(self, now, request, render_kwargs):
		from flask import render_template, make_response
		return make_response(render_template("index_lui.jinja2", **render_kwargs))

__plugin_name__ = "lui"
def __plugin_load__():
	global __plugin_implementation__
	__plugin_implementation__ = LUIPlugin()

	global __plugin_hooks__
	__plugin_hooks__ = {
		"octoprint.ui.web.templatetypes": __plugin_implementation__.add_template_type
	}
