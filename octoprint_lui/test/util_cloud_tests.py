import unittest

from octoprint_lui.util.cloud import *

SECRETS_FILE = r"C:\Users\erikh\AppData\Roaming\OctoPrint\data\lui\cloud.yaml"
DATA_FOLDER = r"C:\Users\erikh\AppData\Roaming\OctoPrint\data\lui"
REDIRECT_URI = "https://www.speedplaza.net/Cloud/"

logging.getLogger("octoprint.plugins.lui.cloud").addHandler(logging.StreamHandler())

def _read_secrets_file(cloud_file):
    if os.path.isfile(cloud_file):
        import yaml
        try:
            with open(cloud_file) as f:
                data = yaml.safe_load(f)
            return data
        except:
            self._logger.exception("Could not read cloud settings")
    else:
        self._logger.warning("Cloud settings not found")

class Dropbox_tests(unittest.TestCase):
    
    def test_dropbox_auth_manual(self):
        secrets = _read_secrets_file(SECRETS_FILE)

        dropbox = DropboxCloudService(secrets["cloud"]["dropbox"], DATA_FOLDER, REDIRECT_URI)
        dropbox.handle_manual_auth_response("J5TEfzIdvq8AAAAAAAADanRn-WpZuMrGimJu6QPzHAw")

        self.assert_(dropbox.is_logged_in())
        self.assertGreater(len(dropbox.list_files()), 0)

class Onedrive_tests(unittest.TestCase):
    def test_onedrive_list_files(self):
        secrets = _read_secrets_file(SECRETS_FILE)

        onedrive = OnedriveCloudService(secrets["cloud"]["onedrive"], DATA_FOLDER, REDIRECT_URI)
        files = onedrive.list_files()

        self.assert_(onedrive.is_logged_in())
        self.assertGreater(len(files), 0)

    def test_onedrive_auth_manual(self):
        secrets = _read_secrets_file(SECRETS_FILE)

        onedrive = OnedriveCloudService(secrets["cloud"]["onedrive"], DATA_FOLDER, REDIRECT_URI)
        onedrive.handle_manual_auth_response("Me40ddeb3-2f9b-366d-d302-46be2a442887")

        self.assert_(onedrive.is_logged_in())
        self.assertGreater(len(onedrive.list_files()), 0)

if __name__ == '__main__':
    unittest.main()
