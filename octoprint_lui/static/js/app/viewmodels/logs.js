$(function() {
    function LogViewModel(parameters) {
        var self = this;

        self.loginState = parameters[0];
        self.flyout = parameters[1];
        self.files = parameters[2];

        // initialize list helper
        self.listHelper = new ItemListHelper(
            "logFiles",
            {
                "name": function(a, b) {
                    // sorts ascending
                    if (a["name"].toLocaleLowerCase() < b["name"].toLocaleLowerCase()) return -1;
                    if (a["name"].toLocaleLowerCase() > b["name"].toLocaleLowerCase()) return 1;
                    return 0;
                },
                "modification": function(a, b) {
                    // sorts descending
                    if (a["date"] > b["date"]) return -1;
                    if (a["date"] < b["date"]) return 1;
                    return 0;
                },
                "size": function(a, b) {
                    // sorts descending
                    if (a["size"] > b["size"]) return -1;
                    if (a["size"] < b["size"]) return 1;
                    return 0;
                }
            },
            {
            },
            "name",
            [],
            [],
            CONFIG_LOGFILESPERPAGE
        );

        self.requestData = function() {
            OctoPrint.logs.list()
                .done(self.fromResponse);
        };

        self.fromResponse = function(response) {
            var files = response.files;
            if (files === undefined)
                return;
            self.listHelper.updateItems(files);
        };

        self.removeFile = function(filename) {
            var data = {}
            data.title = gettext("You are about to remove a log file");
            data.question = _.sprintf(gettext('Are you sure you want to remove "%(filename)s"?'), {filename: filename})
            self.flyout.showConfirmationFlyout(data, true)
                .done(function() {
                    OctoPrint.logs.delete(filename)
                        .done(function() {
                            self.requestData();
                            $.notify({
                                title: gettext("Log file removed"),
                                text: _.sprintf(gettext('Log file: "%(filename)s" has been successfully removed.'), { filename: filename })
                            },
                                "success"
                            )
                        });
                })
        };

        self.copyLogToUsb = function(filename) {
            self._sendApi({
                command: "copy_log_to_usb",
                filename: filename
            }).done(function ()  {
                $.notify(
                    { 
                        title: gettext('Log file copied'), 
                        text: gettext('The log file has been copied to your USB drive.')
                    }, 
                    'success'
                );
            }).fail(function ()  {
                $.notify(
                    { 
                        title: gettext('Copying of log file failed'), 
                        text: gettext('The log file could not be copied. Please check if there is sufficient space available on the drive and try again.')
                    }, 
                    'error'
                );
            })
        };

        self.onSettingsShown = function() {
            self.requestData();
        };

        self._sendApi = function (data) {
            url = OctoPrint.getSimpleApiUrl('lui');
            return OctoPrint.postJson(url, data);
        };
    }

    OCTOPRINT_VIEWMODELS.push([
        LogViewModel,
        ["loginStateViewModel", "flyoutViewModel", "filesViewModel"],
        "#logs"
    ]);
});
