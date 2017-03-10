$(function () {
    function CloudViewModel(parameters) {
        var self = this;

        self.loginState = parameters[0];
        self.flyout = parameters[1];

        self.serviceInfo = ko.observableArray()

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
      ["loginStateViewModel", "flyoutViewModel"],
      ['#cloud_settings_flyout_content']
    ]);

});
