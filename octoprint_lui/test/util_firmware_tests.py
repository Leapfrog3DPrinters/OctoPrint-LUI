from __future__ import absolute_import

import unittest
import os
from octoprint_lui.util.firmware import FirmwareUpdateUtility

class util_firmware_tests(unittest.TestCase):

    data_folder = r'C:\Users\erikh\AppData\Roaming\OctoPrint\data\lui'

    def get_object(self):
        return FirmwareUpdateUtility(self.data_folder)

    def test_get_latest_version(self):
        # Assign
        c = self.get_object()

        # Act
        version_info = c.get_latest_version("Bolt")

        # Assert
        self.assertIsNotNone(version_info)
        self.assertEqual(version_info["version"], 2.6)


    def test_download_firmware(self):
        # Assign
        c = self.get_object()
        version_info = c.get_latest_version("Bolt")

        # Act
        if version_info:
            path = c.download_firmware(version_info["url"])

        # Assert
        self.assertIsNotNone(path)
        if path:
            self.assertTrue(os.path.exists(path))
        
            

if __name__ == '__main__':
    unittest.main()
