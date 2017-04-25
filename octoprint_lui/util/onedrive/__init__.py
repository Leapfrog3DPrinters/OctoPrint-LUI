from __future__ import unicode_literals, with_statement, division

from onedrivesdk.http_provider import HttpProvider
from onedrivesdk.http_response import HttpResponse

import requests
from onedrivesdk import AuthProvider
from onedrivesdk.session import Session
from urllib import urlencode

class ExtendedAuthProvider(AuthProvider):
   
    def is_logged_in(self):
        return not self._session is None

    def delete_session(self):
        self._session = None

    def get_logout_url(self, redirect_uri):
        params = {
            "client_id": self.client_id,
            "redirect_uri": redirect_uri
        }

        logout_url = "https://login.live.com/oauth20_logout.srf"

        return "{}?{}".format(logout_url, urlencode(params))

class ExtendedHttpProvider(HttpProvider):

    def download(self, headers, url, path, callback=None):
        """Downloads a file to the stated path

        Args:
            headers (dict of (str, str)): A dictionary of name-value
                pairs to be used as headers in the request
            url (str): The URL from which to download the file
            path (str): The local path to save the downloaded file

        Returns:
            :class:`HttpResponse<onedrivesdk.http_response.HttpResponse>`:
                The response to the request
        """
        response = requests.get(
            url,
            stream=True,
            headers=headers)

        if response.status_code == 200:
            total_length = response.headers.get('content-length')
            if total_length:
                total_length = int(total_length)
                dl = 0
            with open(path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=1024):
                    if callable(callback):
                        dl += len(chunk)
                        callback(dl / total_length)
                    if chunk:
                        f.write(chunk)
                        f.flush()
            custom_response = HttpResponse(response.status_code, response.headers, None)
        else:
            custom_response = HttpResponse(response.status_code, response.headers, response.text)

        return custom_response

class ExtendedSession(Session):
#TODO: override save and load    
    #def save_session(self, **save_session_kwargs):
        """Save the current session.
        
        Args:
            save_session_kwargs (dicr): To be used by implementation
            of save_session, however save_session wants to use them. The
            default implementation (this one) takes a relative or absolute
            file path for pickle save location, under the name "path"
        """
        

    #@staticmethod
    #def load_session(**load_session_kwargs):
        """Save the current session.
                
        Args:
            load_session_kwargs (dict): To be used by implementation
            of load_session, however load_session wants to use them. The
            default implementation (this one) takes a relative or absolute
            file path for pickle save location, under the name "path"

        Returns:
            :class:`Session`: The loaded session
        """
