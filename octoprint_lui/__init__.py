import octoprint.plugin

class LUIPlugin(octoprint.plugin.UiPlugin,
                       octoprint.plugin.TemplatePlugin,
                       octoprint.plugin.AssetPlugin):

	def get_assets(self):
		return dict(
			js=["js/viewmodel.js"]
		)

	def will_handle_ui(self, request):
		return True

	def on_ui_render(self, now, request, render_kwargs):
		from flask import render_template, make_response
		return make_response(render_template("index_lui.jinja2", **render_kwargs))

__plugin_name__ = "LUI"
__plugin_implementation__ = LUIPlugin()
