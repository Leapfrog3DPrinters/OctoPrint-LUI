from __future__ import absolute_import
import unittest, mock
import logging
import os
from octoprint_lui import LUIPlugin

class Test_octoprintlui_tests(unittest.TestCase):
    
    @mock.patch("octoprint.plugin.PluginSettings")
    @mock.patch("octoprint.printer.PrinterInterface")
    @mock.patch("octoprint.plugin.core.PluginManager")
    def get_object(self, settings, printer, plugin_manager):
        lui = LUIPlugin()
        lui._logger = logging.getLogger("octoprint_lui.test")
        lui._settings = settings
        lui._printer = printer
        lui._plugin_manager = plugin_manager
        
        return lui

    def test_update_changelog(self):
        # Assign
        lui = self.get_object()
        lui.plugin_version = "1.0.3"
        lui._settings.get.return_value = "1.0.2"
        lui.changelog_path = os.path.join(lui.paths["WindowsDebug"]["update"], 'OctoPrint-LUI', lui.changelog_filename)

        # Act
        lui._update_changelog()

        # Assert
        self.assertEqual(len(lui.changelog_contents), 7)
        for line in lui.changelog_contents:
            print line 

if __name__ == '__main__':
    unittest.main()
