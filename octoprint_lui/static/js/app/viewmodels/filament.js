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
        self.forPurge = ko.observable(false);

        self.selectedTemperatureProfile = ko.observable(undefined);
        self.updateLeftTemperatureProfile = ko.observable(undefined);
        self.updateRightTemperatureProfile = ko.observable(undefined);

        self.currentMaterial = ko.pureComputed(function () {
            tool = self.tool();
            if (tool == "tool1")
                return self.leftFilament();
            else
                return self.rightFilament();
        });

        self.materialProfiles = ko.observableArray([]);

        self.filaments = ko.observableArray([]);

        self.leftFilament = ko.observable("None");
        self.rightFilament = ko.observable("None");

        self.leftAmount = ko.observable(undefined);
        self.rightAmount = ko.observable(undefined);
        self.updateLeftAmount = ko.observable(undefined);
        self.updateRightAmount = ko.observable(undefined);

        self.filamentLoading = ko.observable(false);
        self.filamentInProgress = ko.observable(false);

        self.filamentLoadCont = ko.observable(false);

        self.checkRightFilamentAmount = ko.pureComputed(function () {
            if (self.printerState.filament()[0]) {
                return (self.rightAmount() < self.printerState.filament()[0].data().length)
            }
        });

        self.checkLeftFilamentAmount = ko.pureComputed(function () {
            if (self.printerState.filament()[1]) {
                return (self.leftAmount() < self.printerState.filament()[0].data().length)
            }
        });

        self.toolText = ko.pureComputed(function () {
            if (self.tool() != undefined) {
                if (self.tool() === "tool0")
                    return "Right"
                else
                    return "Left"
            }
        });

        self.leftAmountString = ko.pureComputed(function () {
            if (!self.leftAmount()) {
                return "-";
            }
            return (self.leftAmount() / 1000).toFixed(2) + "m";
        });

        self.rightAmountString = ko.pureComputed(function () {
            if (!self.rightAmount()) {
                return "-";
            }
            return (self.rightAmount() / 1000).toFixed(2) + "m";
        });


        self.toolNum = ko.pureComputed(function () {
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
        };

        self.getFilamentMaterial = function (tool) {
            tool = tool || self.tool();

            if (tool == "tool1")
                return self.leftFilament();
            else
                return self.rightFilament();
        };

        self.disableRemove = function(data) {
            return (data.name == self.rightFilament() || data.name == self.leftFilament())
        };

        self.materialButtonText = function(data) {
            if (self.disableRemove(data)) {
                return "Loaded";
            } else {
                return "Delete";
            }
        };

        // Views
        // ------------------

        self.showFilamentChangeFlyout = function (tool, forPurge) {
            self.tool(tool);
            self.loadedFilamentAmount(self.getFilamentAmount(tool));
            self.filamentInProgress(true);
            self.forPurge(forPurge);

            self.changeFilament(tool);

            if (!forPurge) {
                self.showUnload();
                slider.noUiSlider.set(330)

                $('#swap-load-unload').addClass('active');
                $('#swap-info').removeClass('active')
            }
            else {
                $('.swap_process_step').removeClass('active');

                self.loadFilament('purge');
            }


            self.flyout.showFlyout('filament', true)
            .always(function () {
                // If this closes we need to reset stuff
                self.filamentLoadProgress(0);
                self.filamentInProgress(false);
            })
            .done(function () {
                self.changeFilamentDone();
            })
            .fail(function () {
                self.changeFilamentCancel();
            });
        };

        // Below functions swap views for both filament swap and filament detection swap
        self.showUnload = function () {
            $('.swap_process_step,.fd_swap_process_step').removeClass('active');
            $('#unload_filament,#fd_unload_filament').addClass('active');
            $('#unload_cmd,#fd_unload_cmd').removeClass('disabled');
        };

        self.showLoad = function () {
            $('#swap-info,#fd-swap-info').removeClass('active');
            $('#swap-load-unload,#fd-swap-load-unload').addClass('active');
            $('.swap_process_step,.fd_swap_process_step').removeClass('active');
            $('#load_filament,#fd_load_filament').addClass('active');
            self.filamentLoading(false);
        };

        self.showFinished = function () {
            $('#swap-info,#fd-swap-info').removeClass('active')
            $('#swap-load-unload,#fd-swap-load-unload').addClass('active');
            $('.swap_process_step,.fd_swap_process_step').removeClass('active');
            $('#finished_filament,#fd_finished_filament').addClass('active');
        };

        self.onToolHeating = function () {
            $('#swap-info,#fd-swap-info').addClass('active')
            $('#swap-load-unload,#fd-swap-load-unload').removeClass('active');
        }

        self.hideToolLoading = function () {
            $('#tool_loading,#fd_tool_loading').removeClass('active');
        }

        self.finishedLoading = function () {
            // We are finished close the flyout
            self.flyout.closeFlyoutAccept();
        };

        // Api send functions
        self._sendApi = function (data) {
            url = OctoPrint.getSimpleApiUrl('lui');
            return OctoPrint.postJson(url, data);
        };

        self.changeFilament = function (tool) {
            return self._sendApi({
                command: "change_filament",
                tool: tool
            });
        }

        self.changeFilamentCancel = function () {
            self._sendApi({
                command: "change_filament_cancel"
            }).success(function(){
                self.requestData();
            });

        }

        self.changeFilamentDone = function () {
            self._sendApi({
                command: "change_filament_done"
            });
        }

        self.unloadFilament = function () {
            self._sendApi({
                command: "unload_filament"
            });
        }

        self.loadFilament = function (loadFor) {

            var loadFor = loadFor || "swap";
            var profileName = undefined;

            if (loadFor == "filament-detection" && fd_slider.noUiSlider.get()) {
                amount = fd_slider.noUiSlider.get() * 1000;
            }
            else if (loadFor == "filament-detection-purge" || loadFor == "purge") {
                amount = 0;
            }
            else if (slider.noUiSlider.get()) {
                amount = slider.noUiSlider.get() * 1000;
            } else {
                amount = 0;
            }

            if (loadFor == "filament-detection" || loadFor == "filament-detection-purge" || loadFor == "purge") {
                profileName = loadFor;
            }
            else {
                profile = self.selectedTemperatureProfile();
                profileName = profile.name;
            }

            self._sendApi({
                command: "load_filament",
                profileName: profileName,
                amount: amount
            });
        };

        self.updateFilament = function (tool, amount) {
            var profile = undefined;
            if (tool == "tool0") {
                profile = self.updateRightTemperatureProfile();
            } else {
                profile = self.updateLeftTemperatureProfile();
            }

            if (profile == undefined) {
                return $.notify({
                    title: gettext("Filament information updating warning"),
                    text: _.sprintf(gettext('Please select a material to update.'))},
                    "warning"
                )
            }

            var profileName = profile.name;

            if (profileName == "None") {
                amount = 0;
            }
            self._sendApi({
                command: "update_filament",
                tool: tool,
                amount: amount * 1000,
                profileName: profileName
            }).success(function() {
                $.notify({
                    title: gettext("Filament information updated"),
                    text: _.sprintf(gettext('New material: "%(material)s". New amount: "%(amount)s"'), {material: profileName, amount: amount})},
                    "success"
                )
            }).error(function(){
                $.notify({
                    title: gettext("Filament information updated failed"),
                    text: _.sprintf(gettext('Please check the logs for more info.'))},
                    "error"
                )
            }).always(function(){
                self.requestData();
            });


        };

        self.loadFilamentCont = function () {
            tool = self.tool();
            direction = 1;

            self._sendApi({
                command: "load_filament_cont",
                tool: tool,
                direction: direction
            });
        };

        self.loadFilamentContStop = function () {
            self._sendApi({
                command: "load_filament_cont_stop"
            });
        };

        // Handle plugin messages
        self.onDataUpdaterPluginMessage = function (plugin, data) {
            if (plugin != "lui") {
                return;
            }

            var messageType = data['type'];
            var messageData = data['data'];
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
                    self.filamentLoadProgress(0);
                    self.onToolHeating();
                    break;
                case "filament_loading":
                    // Show loading info
                    break;
                case "filament_load_progress":
                    self.filamentInProgress(true);
                    self.filamentLoadProgress(messageData.progress);
                    break;

                case "filament_loading_cont":
                    self.filamentLoadCont(true);
                    break;
                case "filament_loading_cont_stop":
                    self.filamentLoadCont(false);
                    break;
                case "filament_unloading":
                    // Show unloading 
                    break;
                case "filament_finished":
                    self.filamentInProgress(false);
                    self.filamentLoading(false);
                    self.showFinished();
                    self.hideToolLoading();
                    self.filamentLoadProgress(0);
                    // Out for now TODO
                    // $.notify({
                    //     title: gettext("Filament loaded success!"),
                    //     text: _.sprintf(gettext('Filament with profile .. and amount .. loaded'), {})},
                    //     "success"
                    // )
                    self.requestData();
                    break;
                case "filament_cancelled":
                    self.filamentInProgress(false);
                    self.filamentLoading(false);
                    self.filamentLoadProgress(0);
                    $.notify({
                        title: gettext("Filament loaded aborted!"),
                        text: _.sprintf(gettext('Please re-run load filament procedure'), {})
                    },
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

        self.onBeforeBinding = function () {
            self.requestData();
            self.tool("tool0");
            self.copyMaterialProfiles();
        };

        self.onEventSettingsUpdated = function () {
            self.copyMaterialProfiles();
        };

        self.fromResponse = function (data) {
            var filaments = ko.mapping.fromJS(data.filaments);
            self.filaments(filaments());
            self.leftFilament(self.filaments().find(function (x) { return x.tool() === "tool1" }).material.name());
            self.rightFilament(self.filaments().find(function (x) { return x.tool() === "tool0" }).material.name());
            self.leftAmount(self.filaments().find(function (x) { return x.tool() === "tool1" }).amount());
            self.rightAmount(self.filaments().find(function (x) { return x.tool() === "tool0" }).amount());
            self.updateLeftAmount(Math.round(self.leftAmount() / 1000));
            self.updateRightAmount(Math.round(self.rightAmount() / 1000));
        }

        self.requestData = function () {
            return OctoPrint.simpleApiGet('lui', {
                success: self.fromResponse
            });
        };

        self.onSettingsShown = function() {
            self.requestData().success(function () {

                var leftName = self.leftFilament();
                var left = self.materialProfiles().find(function (x) { return x.name == leftName; });
                self.updateLeftTemperatureProfile(left);

                var rightName = self.rightFilament();
                var right = self.materialProfiles().find(function (x) { return x.name == rightName; });
                self.updateRightTemperatureProfile(right);

            });
        };


    }

    OCTOPRINT_VIEWMODELS.push([
      FilamentViewModel,
      ["loginStateViewModel", "settingsViewModel", "flyoutViewModel", "printerStateViewModel", "temperatureViewModel"],
      ["#filament_status", "#filament_flyout", "#filament_override_flyout", "#materials_settings_flyout_content"]
    ]);

});
