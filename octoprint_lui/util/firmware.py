import requests, json
import logging
import shutil, os

class FirmwareUpdateUtility(object):
    """Checks the web for a firmware update"""
    
        
    def __init__(self, data_folder, firmware_version_url):
        self.firmware_version_url = firmware_version_url
        self.firmware_storage_folder = data_folder
        self._logger = logging.getLogger("octoprint.plugins.lui.util.firmwareupdateutility")

    def get_latest_version(self, model):
        """ Returns info about the latest available firmware version """
        all_versions = self._get_version_info()

        if all_versions:
            if "firmware_versions" in all_versions and model.lower() in all_versions["firmware_versions"]:
                model_versions = sorted(all_versions["firmware_versions"][model.lower()], key=lambda info: info["version"], reverse=True)
                if len(model_versions) > 0:
                    return model_versions[0]
                else:
                    return None
            else:
                self._logger.warning("Could not find model \"{0}\" in version information".format(model))
                return None
        else:
            return None

        
    def download_firmware(self, url):
        """ Downloads firmware to local storage and returns stored file path """
        response = requests.get(url, stream=True)
        path = self._get_storage_path()

        if response.status_code == 200:
            with open(path, 'wb') as f:
                response.raw.decode_content = True
                shutil.copyfileobj(response.raw, f)    
                
            return path
        else:
            self._logger.warning("Could not download firmware from {0}. HTTP code: {1}".format(url, response.status_code))
       
    def _get_version_info(self):
        """ Downloads all version info """
        try:
            response = requests.get(self.firmware_version_url)
        except requests.ConnectionError:
            self._logger.warning("Could not get firmware version info. Could not connect to remote server.")
            return None

        if response.status_code == 200:
            try:
                return response.json()
            except ValueError:
                self._logger.warning("Could not get decode firmware version info.")
                return None
        else:
            self._logger.warning("Could not get firmware version info. HTTP code: {0}".format(response.status_code))
            return None

    def _get_storage_path(self):
        """ Gets an absolute path for where to store the firmware file """
        # Use a fixed filename so it will be overwritten on every update
        filename = 'firmware.hex'
        return os.path.join(self.firmware_storage_folder, filename)
        
        


