$(function () {
    function CloudViewModel(parameters) {
        var self = this;

        self.loginState = parameters[0];
        self.flyout = parameters[1];
        self.network = parameters[2];

        self.serviceInfo = ko.observableArray();

        self._onServiceInfoUpdated = [];

        self.isOnline = ko.pureComputed(function()
        {
            return self.network.status.connection.ethernet() || self.network.status.connection.wifi();
        })

        self.getCloudServiceIcon = function (service) {
            return "/plugin/lui/static/img/" + service + ".svg";
        }

        self.getCloudServiceName = function (service) {
            switch (service) {
                case "onedrive":
                    return gettext("OneDrive");
                case "google_drive":
                    return gettext("Google Drive");
                case "dropbox":
                    return gettext("Dropbox");
                default:
                    return gettext(service);
            }
        }

        self.loginService = function (service) {
            self._getApi('cloud/' + service + '/login').done(function (data) {
                var loginWindow = window.open(data.auth_url, "_blank");
                // Can't work with events here because we don't have control over the child's HTML
                var timer = setInterval(checkChild, 500);

                function checkChild() {
                    if (!loginWindow || loginWindow.closed) {
                        self.requestData();
                        clearInterval(timer);
                    }
                }
            });
        }

        self.logoutService = function (service) {
            self._getApi('cloud/' + service + '/logout').done(function (data) {
                var logoutWindow = window.open(data.logout_url, "_blank");
                // Can't work with events here because we don't have control over the child's HTML
                var timer = setInterval(checkChild, 500);

                function checkChild() {
                    if (!logoutWindow || logoutWindow.closed) {
                        self.requestData();
                        clearInterval(timer);
                    }
                }
            });
        }

        self.requestData = function () {
            self._getApi('cloud').done(function (response) {
                ko.mapping.fromJS(response.services, {}, self.serviceInfo);

                _.forEach(self._onServiceInfoUpdated, function (func) { func(); });
            });
        }

        self.onCloudLoginFailed = function()
        {
            $.notify({
                title: gettext("Could not connect to cloud service."),
                text: gettext("The printer could not connect to the cloud service. Please try again and ensure authorize the printer to access to your files.")
            }, "error");
        }

        self.onServiceInfoUpdated = function(callback)
        {
            // Add the callback to the list of callbacks to be executed after requestData
            self._onServiceInfoUpdated.push(callback);
        }

        self.onCloudSettingsShown = function () {
            self.network.requestData();
            self.requestData();
        }

        self._getApi = function (url_suffix) {
            url = OctoPrint.getBlueprintUrl("lui") + url_suffix;
            return OctoPrint.get(url);
        };

        self.onDataUpdaterPluginMessage = function (plugin, data) {
            if (plugin != "lui") {
                return;
            }

            var messageType = data['type'];
            var messageData = data['data'];
            switch (messageType) {
                case "cloud_login_failed":
                    self.onCloudLoginFailed();
                    break;
            }
        }
    }

    OCTOPRINT_VIEWMODELS.push([
      CloudViewModel,
      ["loginStateViewModel", "flyoutViewModel", "networkmanagerViewModel"],
      ['#cloud_settings_flyout_content']
    ]);

});
