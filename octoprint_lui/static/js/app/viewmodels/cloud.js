$(function () {
    function CloudViewModel(parameters) {
        var self = this;

        self.loginState = parameters[0];
        self.flyout = parameters[1];
        self.network = parameters[2];

        self.serviceInfo = ko.observableArray();

        self.serviceInfoMapping = {
            create: function (options) {
                var item = ko.mapping.fromJS(options.data);

                item.authCode = ko.observable();
                item.showAuthCodeForm = ko.observable(false);

                return item;
            }
        };

        self._onServiceInfoUpdated = [];

        self.isOnline = ko.pureComputed(function()
        {
            return self.network.status.ethernet.connected() || self.network.status.wifi.connected();
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

            // If we're local, present the user with a manual auth code entry
            if (IS_LOCAL) {
                self.getServiceInfo(service).showAuthCodeForm(true);
            }
            else {
                var loginUrl = self.getServiceInfo(service).loginUrl();
                var loginWindow = window.open(loginUrl, "_blank");

                // Can't work with events here because we don't have control over the child's HTML
                var timer = setInterval(checkChild, 500);

                function checkChild() {
                    if (!loginWindow || loginWindow.closed) {
                        self.requestData();
                        clearInterval(timer);
                    }
                }
            }
        }

        self.authorizeService = function (service)
        {
            var authCode = self.getServiceInfo(service).authCode();
            sendToApi('cloud/' + service + '/login', { "authCode": authCode }).done(self.requestData);
        }
        
        self.logoutService = function (service) {
            sendToApi('cloud/' + service + '/logout').done(self.requestData);
        }

        self.getServiceInfo = function (service)
        {
            return _.find(self.serviceInfo(), function (serviceInfo) { return serviceInfo.name() == service });
        }

        self.requestData = function () {
            getFromApi('cloud').done(function (response) {
                ko.mapping.fromJS(response.services, self.serviceInfoMapping, self.serviceInfo);

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
