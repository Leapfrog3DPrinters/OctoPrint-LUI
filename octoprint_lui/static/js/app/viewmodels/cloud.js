$(function () {
    function CloudViewModel(parameters) {
        var self = this;

        self.loginState = parameters[0];
        self.flyout = parameters[1];
        self.network = parameters[2];

        self.serviceInfo = ko.observableArray();

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
            self._getApi('cloud/' + service + '/login').success(function (data) {
                var loginWindow = window.open(data.auth_url, "_blank");
                // Can't work with events here because we don't have control over the child's HTML
                var timer = setInterval(checkChild, 500);

                function checkChild() {
                    if (loginWindow.closed) {
                        self.requestData();
                        clearInterval(timer);
                    }
                }
            });
        }

        self.logoutService = function (service) {
            self._getApi('cloud/' + service + '/logout').success(function (data) {
                var logoutWindow = window.open(data.logout_url, "_blank");
                // Can't work with events here because we don't have control over the child's HTML
                var timer = setInterval(checkChild, 500);

                function checkChild() {
                    if (logoutWindow.closed) {
                        self.requestData();
                        clearInterval(timer);
                    }
                }
            });
        }

        self.requestData = function () {
            self._getApi('cloud').success(function (response) {
                ko.mapping.fromJS(response.services, {}, self.serviceInfo);
            });
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

            }
        }
    }

    OCTOPRINT_VIEWMODELS.push([
      CloudViewModel,
      ["loginStateViewModel", "flyoutViewModel", "networkmanagerViewModel"],
      ['#cloud_settings_flyout_content']
    ]);

});
