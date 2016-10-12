$(function ()  {
    function UpdateViewModel(parameters) {
        var self = this;

        self.loginState = parameters[0];
        self.system = parameters[1];
        self.flyout = parameters[2];
        self.files = parameters[3];
        self.settings = parameters[4];
        self.flashArduino = parameters[5];
        self.printerState = parameters[6];

        self.updateinfo = ko.observableArray([]);
        self.updating = ko.observable(false);
        self.update_needed = ko.observable(false);
        self.updateCounter = 0;
        self.updateTarget = 0;
        self.update_warning = undefined;

        self.fileNameToFlash = ko.observable(undefined); // Can either be a local (USB) file name or a filename to be uploaded

        self.modelName = ko.observable(undefined);
        self.firmwareVersion = ko.observable(undefined);

        self.flashingAllowed = ko.computed(function ()  {
            return self.printerState.isOperational() && self.printerState.isReady() && !self.printerState.isPrinting() && self.loginState.isUser();
        });

        self.getUpdateText = function (data) {
            if (data.update()) {
                return "Update"
            } else {
                return "Up-to-date"
            }
        };

        self.getUpdateIcon = function (data) {
            if (data.update()) {
                return "fa-refresh"
            } else {
                return "fa-check"
            }
        };

        self.getUpdateAllText = ko.pureComputed(function () {
            if (self.update_needed() > 0) {
                return "Update"
            } else {
                return "Up-to-date"
            }
        });

        self.getUpdateAllIcon = ko.pureComputed(function () {
            if (self.update_needed() > 0) {
                return "fa-refresh"
            } else {
                return "fa-check"
            }
        });

        self.getUpdateButtonClass = function (data) {
            if (data.update()) {
                return ""
            } else {
                return "ok-button disabled"
            }
        };

        self.getUpdateAllButtonClass = ko.pureComputed(function ()  {
            if (self.update_needed() > 0) {
                return ""
            } else {
                return "ok-button disabled"
            }
        });

        self.browseForFirmware = function ()  {

            self.files.browseUsbForFirmware();

            self.flyout.showFlyout('firmware_file')
                .done(function ()  {
                    file = self.files.selectedFirmwareFile();
                    self.flashArduino.onLocalFileSelected(file);
                })
                .fail(function ()  { })
                .always(function ()  {
                    self.files.browseLocal(); // Reset file list to local gcodes
                });
        };

        self.sendUpdateCommand = function (data) {
            var url = OctoPrint.getBlueprintUrl("lui") + "update";

            var text = "You are about to update a component of the User Interface.";
            var question = "Do want to update " + data.name() + "?";
            var title = "Update: " + data.name()
            var dialog = { 'title': title, 'text': text, 'question': question };

            self.flyout.showConfirmationFlyout(dialog)
                .done(function(){
                    OctoPrint.post(url, "update", {"name":data.name()})
                })
        }

        self.showUpdateWarning = function () 
        {
            self.update_warning = self.flyout.showWarning(
                "Updating", 
                "System is updating, please wait until the updates are completed...", 
                true);
        }

        self.hideUpdateWarning = function () 
        {
            if (self.update_warning)
                self.flyout.closeWarning(self.update_warning);
        }

        self._updateNext = function () 
        {
            //TODO: Provide progress feedback to user
            console.log('Updating' + (self.updateCounter + 1) + '/' + self.updateTarget);
                
            var items = self.updateinfo();
            var data = items[self.updateCounter];

            if (!data.update()) {
                self.updateCounter++;

                if (self.updateCounter == self.updateTarget)
                    self.system.systemServiceRestart();
                else
                    return self._updateNext();
            }
            else {
                var command = {
                    'actionSource': 'custom',
                    'action': data.action(),
                    'name': data.name(),
                    'before': self.showUpdateWarning,
                    'after': self.hideUpdateWarning
                };
                self.system.triggerCommand(command)
                    .done(function ()  {
                        self.updateCounter++;

                        if (self.updateCounter == self.updateTarget)
                            self.system.systemServiceRestart();
                        else
                            self._updateNext();
                    }).fail(function ()  {
                        $.notify({ title: 'Software update failed', text: 'An error has occured while trying to update the software. Please try again.' }, "error");
                    });
            }
        }

        self.updateAll = function (data) {

            self.updateCounter = 0;
            self.updateTarget = self.updateinfo().length;

            if (self.updateTarget > 0) {
                var text = "You are about to update the printer software.";
                var question = "Do want to continue?";
                var title = "Update software";

                self.flyout.showConfirmationFlyout({ 'title': title, 'text': text, 'question': question }).done(function ()  {
                    self._updateNext();
                })
            }

            
                
        };

        self.fromResponse = function (data) {
            var info = ko.mapping.fromJS(data.update);
            var updates = 0;
            _.each(info(), function (i) {
                if (i.update()) updates++
            });
            self.update_needed(updates);
            self.updateinfo(info());

            self.modelName(data.machine_info.machine_type);
            self.firmwareVersion(data.machine_info.firmware_version);
        };

        self.requestData = function (force) {
            var force = force || false;
            var url = OctoPrint.getBlueprintUrl("lui") + "update";
            OctoPrint.getWithQuery(url, {force: force})
                .done(function(response){
                    self.fromResponse(response);
                });
        };

        self.onFirmwareUpdateFound = function (file) {

            if ((!self.flyout.isOpen() || !self.flyout.blocking)) {
                var title = "Firmware update found"
                var text = _.sprintf(gettext('The USB drive you inserted contains a firmware update with filename "%(filename)s".'), { filename: file["name"] });
                var question = "Would you like to install this update?";

                var dialog = { 'title': title, 'text': text, 'question': question };

                self.flyout.showConfirmationFlyout(dialog)
                    .done(function ()  {
                        self.settings.showSettingsTopic('update');
                        self.flashArduino.onLocalFileSelected(file);
                    });
            }
        };

        self.refreshUpdateInfo = function ()  {
            self.updating(true);
            $('#update_spinner').addClass('fa-spin');
            self.requestData(true);
        }

        self.onHexPathChanged = function(hex_path)
        {
            self.fileNameToFlash(hex_path);
        }

        self.onUpdateSettingsShown = function ()  {
            self.requestData();
        };

        self.onSettingsHidden = function ()  {
            self.flashArduino.resetFile();
        }

        self.onUserLoggedIn = function ()  {
            self.requestData();
        };

        self.onAfterBinding = function () 
        {
            self.flashArduino.hex_path.subscribe(self.onHexPathChanged);

            // Communicate to the plugin wheter he's allowed to flash
            self.flashingAllowed.subscribe(function (allowed) { self.flashArduino.flashingAllowed(allowed); });

            
        }

        self.onDataUpdaterPluginMessage = function (plugin, data) {
            if (plugin != "lui") {
                return;
            }

            var messageType = data['type'];
            var messageData = data['data'];
            switch (messageType) {
                case "firmware_update_found":
                    self.onFirmwareUpdateFound(messageData.file);
                    break;
                case "internet_offline":
                    $.notify({
                        title: gettext("Printer offline"),
                        text: _.sprintf(gettext('The printer seems not connected to the internet. Please make sure the network has internet capabilties. '), {})
                    },
                        "error"
                    )
                    break;
                case "github_offline":
                    $.notify({
                        title: gettext("Update server offline"),
                        text: _.sprintf(gettext('The update server seems to be offline. Please retry updating after or check the status at github.com/Leapfrog3DPrinters'), {})
                    },
                        "error"
                    )
                    break;
                case "update_fetch_error":
                    $.notify({
                        title: gettext("Update fetching failed."),
                        text: _.sprintf(gettext('Please check the logs.'), {})
                    },
                        "error"
                    )
                    break;
                case "update_fetch_success":
                    console.log("Update received", messageData)
                    self.fromResponse(messageData);
                    self.updating(false);
                    $('#update_spinner').removeClass('fa-spin');
            }
        }
    }

    OCTOPRINT_VIEWMODELS.push([
      UpdateViewModel,
      ["loginStateViewModel", "systemViewModel", "flyoutViewModel", "gcodeFilesViewModel", "settingsViewModel", "flashArduinoViewModel", "printerStateViewModel"],
      ['#update', '#update_icon']
    ]);

});
