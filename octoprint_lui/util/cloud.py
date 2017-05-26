from __future__ import division
from octoprint.filemanager import get_file_type, valid_file_type
from octoprint.filemanager.storage import StorageInterface, LocalFileStorage
from flask.ext.login import current_user

# OneDrive
import onedrivesdk
from octoprint_lui.util.onedrive import ExtendedHttpProvider, ExtendedAuthProvider, ExtendedSession

# GoogleDrive
from apiclient.discovery import build
from oauth2client import client
from oauth2client import tools
from oauth2client.file import Storage
from oauth2client.client import OAuth2WebServerFlow
import httplib2
import pickle
import os
from googleapiclient.http import MediaIoBaseDownload
import io
import logging

# Dropbox
import dropbox

ONEDRIVE = "onedrive"
GOOGLE_DRIVE = "google_drive"
DROPBOX = "dropbox"

INSTALLED_SERVICES = [ DROPBOX, ONEDRIVE, GOOGLE_DRIVE ]


class CloudService(object):
    def __init__(self, secrets, data_folder, default_redirect_uri):
        self._logger = logging.getLogger("octoprint.plugins.lui.cloud")
        self._redirect_uri = default_redirect_uri
    def get_auth_url(self, redirect_uri):
        pass
    def handle_auth_response(self, request):
        pass
    def handle_manual_auth_response(self, auth_code):
        pass
    def list_files(self, path=None, filter=None):
        pass
    def download_file(self, path, target_path, progress_callback = None):
        pass
    def logout(self):
        pass

class DropboxCloudService(CloudService):
    def __init__(self, secrets, data_folder, default_redirect_uri):
        super(DropboxCloudService, self).__init__(secrets, data_folder, default_redirect_uri)
        self._secrets = secrets
        self._csrf = "csrf"
        
        self._client = None
        self._client_secret = self._secrets.get('client_secret');
        self._client_id = self._secrets.get('client_id');
        self._access_token = None
        self._id_tracker = {}
        self._credential_path = os.path.join(data_folder, DROPBOX + "_credentials.pickle")
        self._load_credentials()

        self._flow = dropbox.client.DropboxOAuth2Flow(self._client_id, self._client_secret, self._redirect_uri, None, self._csrf)
        
    ## Private methods
    def _get_client(self):
        if not self._client:
            self._client = dropbox.Dropbox(self._access_token)
            self._logger.debug("Dropbox client created")

        return self._client

    def _load_credentials(self):
        if os.path.isfile(self._credential_path):
            with open(self._credential_path, "rb") as session_file:
                import pickle
                self._access_token = pickle.load(session_file)
            
            self._logger.debug("Dropbox credentials loaded")

        return self._access_token

    def _delete_credentials(self):
        if os.path.isfile(self._credential_path):
            os.unlink(self._credential_path)
            self._logger.debug("Dropbox credentials deleted")
        
        self._access_token = None

    def _save_credentials(self):
        try:
            with open(self._credential_path, "wb") as session_file:
                import pickle
                pickle.dump(self._access_token, session_file, pickle.HIGHEST_PROTOCOL)
                self._logger.debug("Dropbox credentials saved")
        except OSError as e:
            self._logger.exception("Could not store Dropbox credentials")

    def _get_file_type(self, item):
        if type(item) is dropbox.files.FolderMetadata:
            return 'folder'
        else:
            type_path = get_file_type(item.name)
            return type_path[0] if type_path else None

    ## Public methods

    def is_logged_in(self):
        return self._access_token is not None

    def get_auth_url(self, redirect_uri):
        self._redirect_uri = redirect_uri
        return self._flow.start()

    def handle_auth_response(self, request):
        if not self._flow:
            self._logger.error("Could not handle unrequested Dropbox authentication")
            return False

        try:
            self._access_token, _, _ = self._flow.finish(request.values)
            self._logger.info("Dropbox authenticated")
            return True
        except Exception as e:
            self._logger.warning("Dropbox could not be authenticated: {0}".format(e.message))
            return False

        self._client = self._get_client()
        self._save_credentials()
        return True

    def handle_manual_auth_response(self, auth_code):
        try:
            self._access_token, _ = self._flow._finish(auth_code, self._redirect_uri)
            self._logger.info("Dropbox authenticated")
        except dropbox.exceptions.HttpError as e:
            self._logger.warning("Dropbox could not be authenticated: {0}".format(e.body))
        except Exception as e:
            self._logger.warning("Dropbox could not be authenticated: {0}".format(e.message))
            return False

        self._client = self._get_client()
        self._save_credentials()
        return True

    def list_files(self, path = None, filter = None):

        if path == None:
            path = DROPBOX
        else:
            path = path.rstrip('/')

        if path == DROPBOX:
            path_id = ''
        else:
            path_id = self._id_tracker[path]

        folder = self._get_client().files_list_folder(path_id).entries
        items = []
        for f in folder:
            file_path = path + "/" + f.name
            self._id_tracker[file_path] = f.path_lower

            file_type = self._get_file_type(f)
            
            entry_data = {
                            "name": f.name,
		                    "path": file_path,
                            "service": DROPBOX,
		                    "type": file_type,
                            "origin": "cloud"
                            }

            if file_type and (not filter or filter(f.name, entry_data)):
                items.append(entry_data)

        return items

    def download_file(self, path, target_path, progress_callback = None):
        file_id = self._id_tracker[path]
        entry, response = self._get_client().files_download(file_id)
        total_length = entry.size
        
        if total_length:
            total_length = int(total_length)
            dl = 0
        
        with open(target_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=2**16):
                if callable(progress_callback):
                    dl += len(chunk)
                    progress_callback(dl / total_length)
                if chunk:
                    f.write(chunk)
                    f.flush()

    def logout(self):
        if self._access_token:
            try:
                self._get_client().auth_token_revoke()
                self._logger.debug("Dropbox auth token revoked")
            except Exception as e:
                self._logger.debug("Could not revoke Dropbox auth token: %s" % e.message)

        self._delete_credentials()
        self._client = None
        self._logger.info("Dropbox disconnected")


class GoogleDriveCloudService(CloudService):
    def __init__(self, secrets, data_folder, default_redirect_uri):
        super(GoogleDriveCloudService, self).__init__(secrets, data_folder, default_redirect_uri)
        self._secrets = secrets
        self._http = httplib2.Http()
        self._client = None
        self._client_secret = self._secrets.get('client_secret')
        self._client_id = self._secrets.get('client_id')
        self._credentials = None
        self._id_tracker = {}
        self._credential_path = os.path.join(data_folder, GOOGLE_DRIVE + "_credentials.pickle")
        self._load_credentials()
        self._refresh_credentials()
        self._flow = self._flow_factory(self._redirect_uri)
        
    ## Private methods
    def _get_client(self):
        if not self._client:
            self._client = build('drive', 'v3', http=self._http)
            self._logger.debug("Google Drive client created")

        return self._client

    def _refresh_credentials(self):
        if self._credentials:
            try:
                self._credentials.refresh(self._http)
            except:
                self._logger.exception("Could not refresh token for Google Drive")

    def _load_credentials(self):
        if os.path.isfile(self._credential_path):
            with open(self._credential_path, "rb") as session_file:
                import pickle
                self._credentials = pickle.load(session_file)
            
            if self._credentials.access_token_expired:
                self._logger.warn("Google Drive credentials expired")
                self._delete_credentials()
            else:
                self._http = self._credentials.authorize(self._http)

        return self._credentials

    def _delete_credentials(self):
        if os.path.isfile(self._credential_path):
            os.unlink(self._credential_path)
            self._logger.debug("Google Drive credentials deleted")
        
        self._credentials = None

    def _save_credentials(self):
        with open(self._credential_path, "wb") as session_file:
            import pickle
            pickle.dump(self._credentials, session_file, pickle.HIGHEST_PROTOCOL)
            self._logger.debug("Google Drive credentials saved")

    def _flow_factory(self, redirect_uri):
        return OAuth2WebServerFlow(client_id=self._client_id,
                            client_secret=self._client_secret,
                            scope='https://www.googleapis.com/auth/drive.readonly',
                            redirect_uri=redirect_uri)

    def _get_file_type(self, item):
        if "mimeType" in item and item["mimeType"] == "application/vnd.google-apps.folder":
            return "folder"
        else:
            type_path = get_file_type(item["name"])
            return type_path[0] if type_path else None

    ## Public methods

    def is_logged_in(self):
        return not self._credentials is None

    def get_auth_url(self, redirect_uri):
        self._redirect_uri = redirect_uri
        self._flow = self._flow_factory(redirect_uri)

        return self._flow.step1_get_authorize_url()

    def handle_auth_response(self, request):
        if not self._flow:
            self._logger.error("Could not handle unrequested Google Drive authentication")
            return False

        access_token = request.values.get("code")
        try:
            self._credentials = self._flow.step2_exchange(access_token)
            self._http = self._credentials.authorize(self._http)
            self._save_credentials()
            self._logger.info("Google Drive authenticated")
            return True
        except Exception as e:
            self._logger.exception("Google Drive authentication failed: {0}".format(e.message))
            return False

    def handle_manual_auth_response(self, auth_code):
        try:
            self._credentials = self._flow.step2_exchange(auth_code)
            self._http = self._credentials.authorize(self._http)
            self._save_credentials()
            self._logger.info("Google Drive authenticated")
            return True
        except Exception as e:
            self._logger.exception("Google Drive authentication failed: {0}".format(e.message))
            return False

    def list_files(self, path = None, filter = None):

        if path == None:
            path = GOOGLE_DRIVE
        else:
            path = path.rstrip('/')

        if path == GOOGLE_DRIVE:
            path_id = 'root'
        else:
            path_id = self._id_tracker[path]

        q = "(mimeType='application/vnd.google-apps.folder' or fileExtension='g' or fileExtension='gco' or fileExtension='gcode') and '{0}' in parents".format(path_id)
        
        request = self._get_client().files().list(q=q, spaces='drive', fields="files(id, name, mimeType)").execute()
           
        folder = request.get('files', [])
        items = []
        
        for f in folder:
            file_path = path + "/" + f["name"]
            self._id_tracker[file_path] = f["id"]

            file_type = self._get_file_type(f)
            
            entry_data = {
                            "name": f["name"],
		                    "path": file_path,
                            "service": GOOGLE_DRIVE,
		                    "type": file_type,
                            "origin": "cloud"
                            }

            if file_type and (not filter or filter(f["name"], entry_data)):
                items.append(entry_data)

        return items

    def download_file(self, path, target_path, progress_callback = None):
        file_id = self._id_tracker[path]
        request = self._get_client().files().get_media(fileId=file_id)
        with open(target_path, 'wb') as fh:
            downloader = MediaIoBaseDownload(fh, request)
            done = False
            while done is False:
                status, done = downloader.next_chunk()
                if progress_callback and callable(progress_callback):
                    progress_callback(status.progress())

    def logout(self):
        if self._credentials and not self._credentials.access_token_expired:
            try:
                self._credentials.revoke(self._http)
                self._logger.debug("Google Drive credentials revoked")
            except:
                pass            

        self._delete_credentials()
        self._client = None


class OnedriveCloudService(CloudService):
    def __init__(self, secrets, data_folder, default_redirect_uri):
        super(OnedriveCloudService, self).__init__(secrets, data_folder, default_redirect_uri)
        self._secrets = secrets
        self._client = None

        self._client_secret = self._secrets.get('client_secret');
        self._client_id = self._secrets.get('client_id');

        self._api_base_url = 'https://api.onedrive.com/v1.0/'
        self._scopes = ['wl.signin', 'wl.offline_access', 'onedrive.readonly']
        self._access_token = None

        self._credential_path = os.path.join(data_folder, ONEDRIVE + "_credentials.pickle")

        self._http_provider = ExtendedHttpProvider()
        self._auth_provider = ExtendedAuthProvider(
                    http_provider=self._http_provider,
                    client_id=self._client_id,
                    scopes=self._scopes,
                    session_type=ExtendedSession
                    )

        try:
            self._auth_provider.load_session(path=self._credential_path)
            self._auth_provider.refresh_token()
            self._logger.debug("OneDrive token refreshed")
        except:
            self._logger.exception("OneDrive: Could not refresh token")

    ## Private methods

    def _get_client(self):
        if not self._client:
            self._client = onedrivesdk.OneDriveClient(self._api_base_url, self._auth_provider, self._http_provider)
            self._logger.debug("OneDrive client created")
            
        return self._client

    def _get_file_type(self, item):
        if item.folder:
            return "folder"
        else:
            type_path = get_file_type(item.name)
            return type_path[0] if type_path else None

    ## Public methods

    def is_logged_in(self):
        return self._auth_provider.is_logged_in()

    def get_auth_url(self, redirect_uri):
        self._redirect_uri = redirect_uri;
        auth_url = self._get_client().auth_provider.get_auth_url(self._redirect_uri)

        return auth_url

    def handle_auth_response(self, request):
        access_token = request.values.get("code")
        auth_provider = self._get_client().auth_provider
        self._logger.debug("OneDrive access token received")
        try:
            auth_provider.authenticate(access_token, self._redirect_uri, self._client_secret)
            self._access_token = access_token
            auth_provider.save_session(path=self._credential_path)
            self._logger.info("OneDrive authenticated")
            return True
        except Exception as e:
            self._logger.debug("OneDrive not authenticated: {0}".format(e.message))
            return False

    def handle_manual_auth_response(self, auth_code):
        auth_provider = self._get_client().auth_provider
        self._logger.debug("OneDrive access token received")
        try:
            auth_provider.authenticate(auth_code, self._redirect_uri, self._client_secret)
            self._access_token = auth_code
            auth_provider.save_session(path=self._credential_path)
            self._logger.info("OneDrive authenticated")
            return True
        except Exception as e:
            self._logger.debug("OneDrive not authenticated: {0}".format(e.message))
            return False

    def logout(self):
        self._get_client().auth_provider.delete_session()
        self._logger.info("OneDrive disconnected")

    def list_files(self, path=None, filter=None):
        
        if path == None:
            path = ONEDRIVE

        folder = self._get_client().drive.item_by_path(path[len(ONEDRIVE):] + "/").children.get()
        items = []
        
        for f in folder:
            file_path = path + "/" + f.name
            file_type = self._get_file_type(f)
            
            entry_data = {
                            "name": f.name,
		                    "path": file_path,
                            "service": ONEDRIVE,
		                    "type": file_type,
                            "origin": "cloud"
                         }

            if file_type and (not filter or filter(f.name, entry_data)):
                items.append(entry_data)

        return items

    def download_file(self, path, target_path, progress_callback = None):
        file = self._get_client().drive.item_by_path(path[len(ONEDRIVE):]).request()
        self._get_client().auth_provider.authenticate_request(file)
        response = self._get_client().http_provider.download(file._headers, file.request_url, target_path, progress_callback)
        return response

class CloudConnect():
    def __init__(self, data_folder, default_redirect_uri):
        self._data_folder = data_folder
        self._default_redirect_uri = default_redirect_uri

        self._cloud_secrets = []
        self._logger = logging.getLogger(__name__)

        self.services = {}
        
        self._read_secrets()
        self._init_all_services()
    
    ## Private methods

    def _read_secrets(self):
        secrets_data = self._read_secrets_file()

        if secrets_data and "cloud" in secrets_data:
            self._cloud_secrets = secrets_data["cloud"]

    def _read_secrets_file(self):
        cloud_file = os.path.join(self._data_folder, "cloud.yaml")
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

    def _init_all_services(self):
        for service in INSTALLED_SERVICES:
            service_obj = self._service_factory(service)

            if service_obj:
                self.services[service] = service_obj

    def _service_factory(self, service):
        if service == ONEDRIVE and ONEDRIVE in self._cloud_secrets:
            return OnedriveCloudService(self._cloud_secrets[ONEDRIVE], self._data_folder, self._default_redirect_uri)
        elif service == GOOGLE_DRIVE and GOOGLE_DRIVE in self._cloud_secrets:
            return GoogleDriveCloudService(self._cloud_secrets[GOOGLE_DRIVE], self._data_folder, self._default_redirect_uri)
        elif service == DROPBOX and DROPBOX in self._cloud_secrets:
            return DropboxCloudService(self._cloud_secrets[DROPBOX], self._data_folder, self._default_redirect_uri)
    ## Public methods

    def get_service(self, service):
        if service in self.services:
            return self.services[service]

    def get_available_services(self):
        return self.services.keys()

    def is_logged_in(self, service):
        return self.get_service(service).is_logged_in()

    def get_auth_url(self, service, redirect_uri):
        return self.get_service(service).get_auth_url(redirect_uri)

    def handle_auth_response(self, service, request):
        return self.get_service(service).handle_auth_response(request)

    def handle_manual_auth_response(self, service, auth_code):
        return self.get_service(service).handle_manual_auth_response(auth_code)

    def logout(self, service):
        return self.get_service(service).logout()


class CloudStorage(LocalFileStorage):
    def __init__(self, cloud_connect):
        self._cloud_connect = cloud_connect

    ## Public methods

    def list_files(self, path=None, filter=None, recursive=False):
        if not path:
            return [ {
                        "name": service,
		                "path": service,
                        "service": service,
                        "is_connected": self._cloud_connect.get_service(service).is_logged_in(),
		                "type": "folder",
                        "origin": "cloud"
                    } for service in self._cloud_connect.get_available_services()]
        else:
            service = self._get_service_from_path(path)
            return self._cloud_connect.get_service(service).list_files(path, filter)


    def download_file(self, path, target_path, progress_callback = None):
        service = self._get_service_from_path(path)
        self._cloud_connect.get_service(service).download_file(path, target_path, progress_callback)

    @property
    def analysis_backlog(self):
        return []

    def last_modified(self, path = None, recursive = False):
        return None

    ## Private methods
    
    def _get_service_from_path(self, path):
        path_paths = path.split('/')
        return path_paths[0]

    def _sanitize_entry(self, entry, path, entry_path):
        return entry, entry_path
