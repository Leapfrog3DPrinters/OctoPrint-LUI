$(function () {
    function FilamentViewModel(parameters) {
        var self = this;

        // The tool number for which the filament is being swapped

        self.loginState = parameters[0];
        self.settings = parameters[1];
        self.flyout = parameters[2];
        self.printerState = parameters[3];
        self.temperatureState = parameters[4];

        self.loadedFilamentAmount = ko.observable(0);
        self.tool = ko.observable(undefined);
        self.filamentLoadProgress = ko.observable(0);

        self.selectedTemperatureProfile = ko.observable(undefined);
        self.materialProfiles = ko.observableArray([]);

        self.filaments = ko.observableArray([]);

        self.leftFilament = ko.observable("None");
        self.rightFilament = ko.observable("None");

        self.leftAmount = ko.observable(undefined);
        self.rightAmount = ko.observable(undefined);

        self.filamentLoading = ko.observable(false);
        self.filamentInProgress = ko.observable(false);

        self.checkRightFilamentAmount = ko.pureComputed (function(){
            if (self.printerState.filament()[0]) {
                if (self.rightAmount() < self.printerState.filament()[0].data().length)
                    return "file_failed"
            }
        });

        self.checkLeftFilamentAmount = ko.pureComputed (function(){
            if (self.printerState.filament()[1]) {
                if (self.leftAmount() < self.printerState.filament()[0].data().length)
                    return "file_failed"
            }
        });

        self.toolText = ko.pureComputed(function() {
            if (self.tool() != undefined) {
                if (self.tool() === "tool0")
                    return "Right"
                else
                    return "Left"
            }
        });

        self.leftAmountString = ko.pureComputed(function(){
            if (!self.leftAmount()) {
                return "-";
            }
            return (self.leftAmount() / 1000).toFixed(2) + "m";
        });

        self.rightAmountString = ko.pureComputed(function(){
            if (!self.rightAmount()) {
                return "-";
            }
            return (self.rightAmount() / 1000).toFixed(2) + "m";
        });


        self.toolNum = ko.pureComputed(function() {
            if (self.tool() != undefined) {
                var tool = self.tool();
                return parseInt(tool.slice(-1));
            }
        });

        self.getFilamentAmount = function (tool) {
            if (tool === "tool0")
                return self.rightAmountString();
            else
                return self.leftAmountString();
        }

        // Views
        // ------------------

        self.showFilamentChangeFlyout = function (tool) {
            self.tool(tool);
            self.loadedFilamentAmount(self.getFilamentAmount(tool));
            self.filamentInProgress(true);

            self.changeFilament(tool);
            self.showUnload();
            slider.noUiSlider.set(330)

            $('#swap-load-unload').addClass('active');
            $('#swap-info').removeClass('active')
            

            self.flyout.showFlyout('filament')
            .always(function () {
                // If this closes we need to reset stuff
                self.filamentLoadProgress(0);
            })
            .done(function () {

            })
            .fail(function () {
                self.cancelChangeFilament();
            });
        };

        self.showUnload = function () {
            $('.swap_process_step').removeClass('active');
            $('#unload_filament').addClass('active');
            $('#unload_cmd').removeClass('disabled');
        };

        self.showLoad = function () {
            $('#swap-info').removeClass('active')
            $('#swap-load-unload').addClass('active');
            $('.swap_process_step').removeClass('active');
            $('#load_filament').addClass('active');
            self.filamentLoading(false);
        };

        self.showFinished = function () {
            $('#swap-info').removeClass('active')
            $('#swap-load-unload').addClass('active');
            $('.swap_process_step').removeClass('active');
            $('#finished_filament').addClass('active');
        };

        self.finishedLoading = function () {
            // We are finished close the flyout
            self.flyout.closeFlyoutAccept();
        };

        // Api send functions
        self._sendApi = function (data) {
            url = OctoPrint.getSimpleApiUrl('lui');
            OctoPrint.postJson(url, data);
        };

        self.changeFilament = function (tool) {
            self._sendApi({
                command: "change_filament",
                tool: tool
            });
        }

        self.cancelChangeFilament = function () {
            self._sendApi({
                command: "cancel_change_filament"
            });
        }

        self.unloadFilament = function () {
            self._sendApi({
                command: "unload_filament"
            });
        }

        self.loadFilament = function() {
            if (slider.noUiSlider.get()) {
                amount = slider.noUiSlider.get() * 1000;
            } else {
                amount = 0;
            }
            profile = self.selectedTemperatureProfile();

            self._sendApi({
                command: "load_filament",
                profile: profile,
                amount: amount
            });
        }

        self.updateFilament = function (tool, amount) {
            self._sendApi({
                command: "update_filament", 
                tool: tool,
                amount: amount
            })
        };


        // Handle plugin messages
        self.onDataUpdaterPluginMessage = function (plugin, data) {
            if (plugin != "lui") {
                return;
            }

            var messageType = data.type;
            var messageData = data.data;
            switch (messageType) {
                case "filament_in_progress":
                    self.filamentInProgress(true);
                    break;
                case "skip_unload":
                    self.showLoad();
                    break;
                case "tool_heating":
                    self.filamentInProgress(true);
                    self.filamentLoading(true);
                    $('#swap-info').addClass('active')
                    $('#swap-load-unload').removeClass('active');
                    break;
                case "filament_loading":
                    // Show loading info
                    break;
                case "filament_load_progress":
                    self.filamentInProgress(true);
                    self.filamentLoadProgress(messageData.progress);
                    break;
                case "filament_unloading":
                    // Show unloading 
                    break;
                case "filament_finished":
                    self.filamentInProgress(false);
                    self.filamentLoading(false);
                    self.showFinished();
                    $('#tool_loading').toggleClass('active');
                    self.filamentLoadProgress(0);
                    $.notify({
                        title: gettext("Filament loaded success!"),
                        text: _.sprintf(gettext('Filament with profile .. and amount .. loaded'), {})},
                        "success"
                    )
                    self.requestData();
                    break;
                case "filament_cancelled":
                    self.filamentInProgress(false);
                    self.filamentLoading(false);
                    self.filamentLoadProgress(0);
                    $.notify({
                        title: gettext("Filament loaded aborted!"),
                        text: _.sprintf(gettext('Please re-run load filament procedure'), {})},
                        "warning"
                    )
                    self.requestData();
                    // Do cancel action
                    break;
                case "update_filament_amount":
                    //console.log(messageData.extrusion)
                    // TODO
                        self.rightAmount(messageData.filament[0])
                        self.leftAmount(messageData.filament[1])
                    break;

            }
        };


        self.copyMaterialProfiles = function () {
            // Copy the settings materials and add a "None" profile
            self.materialProfiles(self.settings.temperature_profiles.slice(0));
            self.materialProfiles.unshift({
                bed: 0,
                extruder: 0,
                name: "None"
            });
        }

        self.onBeforeBinding = function(){
            self.requestData();
            self.tool("tool0");
            self.copyMaterialProfiles();
        };

        self.onEventSettingsUpdated = function () {
            self.copyMaterialProfiles();
        };

        self.fromResponse = function(data) {
            var filaments = ko.mapping.fromJS(data.filaments);
            self.filaments(filaments());
            self.leftFilament(self.filaments().find(x=> x.tool() === "tool1").material.name());
            self.rightFilament(self.filaments().find(x=> x.tool() === "tool0").material.name());
            self.leftAmount(self.filaments().find(x=> x.tool() === "tool1").amount());
            self.rightAmount(self.filaments().find(x=> x.tool() === "tool0").amount());
        }

        self.requestData = function () {
          OctoPrint.simpleApiGet('lui', {
            success: self.fromResponse
          });
        }


    }

    OCTOPRINT_VIEWMODELS.push([
      FilamentViewModel,
      ["loginStateViewModel", "settingsViewModel", "flyoutViewModel", "printerStateViewModel", "temperatureViewModel"],
      ["#filament_status", "#filament_flyout"]
    ]);

});