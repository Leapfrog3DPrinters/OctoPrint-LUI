$(function ()  {
    function FilamentViewModel(parameters) {
        var self = this;

        self.loginState = parameters[0];
        self.settings = parameters[1];
        self.flyout = parameters[2];
        self.printerState = parameters[3];
        self.toolInfo = parameters[4];
        self.introView = parameters[5];

        self.loadedFilamentAmount = ko.observable();
        self.tool = ko.observable(undefined);
        self.filamentLoadProgress = ko.observable(0);
        self.forPurge = ko.observable(false);

        // Let's create an alias for the tools array, we're gonna use it a lot from here
        self.tools = self.toolInfo.tools;

        // IsExtruding is now stored in toolInfo.tools. This helper lets you know if there's any of these tools extruding
        self.isAnyExtrudingOrRetracting = ko.pureComputed(function () {
            return _.some(self.tools(), function (tool) { return tool.filament.isExtruding() || tool.filament.isRetracting(); });
        });

        self.isProfileLocked = ko.observable(false);

        self.preselectedTemperatureProfile = ko.observable(undefined); // Used for locked profile selection (paused filament swap)
        self.preselectedTemperatureProfileName = ko.pureComputed(function () {
            var profile = self.preselectedTemperatureProfile();
            if (profile)
                return profile.name;
            else
                return "None";
        });

        self.selectedTemperatureProfile = ko.observable(undefined); // Used for free profile selection
        self.selectedTemperatureProfileName = ko.pureComputed(function () {
            var profile = self.selectedTemperatureProfile();
            if (profile)
                return profile.name;
            else
                return "None";
        });

        self.materialProfiles = ko.observableArray([]);

        self.filamentsMapping = {
            key: function (data) {
                return ko.utils.unwrapObservable(data.tool);
            },
            create: function (options) {
                var model = ko.mapping.fromJS(options.data);

                model.material = ko.pureComputed({
                    read: function () { return self.materialProfiles().find(function (profile) { return profile.name == model.materialProfileName() }); }
                });

                model.amountMeter = ko.pureComputed({
                    read: function () {
                        return Math.round(model.amount() / 1000);
                    },
                    write: function (value) {
                        model.amount(value * 1000);
                    }
                });

                return model;
            }
        };

        self.filamentLoading = ko.observable(false);
        self.filamentInProgress = ko.observable(false);

        self.getSwapFilamentButtonContents = function (tool) {
            switch (tool) {
                case "tool0":
                    return '<i class="fa fa-refresh"></i>' + gettext('Swap right');
                case "tool1":
                    return '<i class="fa fa-refresh"></i>' + gettext('Swap left');
            }

        }

        self.toolText = ko.pureComputed(function () {
            if (self.tool() == "tool0")
                return gettext("Right");
            else
                return gettext("Left");
            });

        self.filamentLoadingText = ko.observable(undefined);

        self.filamentActionText = ko.observable(undefined);

        self.toolNum = ko.pureComputed(function () {
            var tool = self.tool();
            if (tool !== undefined) {
                return parseInt(tool.slice(-1));
            }
            });

        self.getAmountString = function (amount)  {
            if (!amount) {
                return "-";
            }
            return (amount / 1000).toFixed(2) + "m";
            };

        self.getFilamentAmount = function (tool) {
            return self.getFilament(tool).amount();
        };

        self.setFilamentAmount = function (tool, amount) {
            return self.getFilament(tool).amount(amount);
        };

        self.getFilamentMaterial = function (tool) {
            return self.materialProfiles().find(function (profile) { return profile.name == self.getFilament(tool).materialProfileName(); });
        }

        self.getFilament = function (tool) {
            tool = tool || self.tool();

            return self.toolInfo.getToolByKey(tool).filament;
        }

        self.disableRemove = function (data) {
            return _.some(self.tools(), function (tool) { return tool.filament.materialProfileName() == data.name });
        }

        self.materialButtonText = function(data) {
            if (self.disableRemove(data)) {
                return gettext("Loaded");
            } else {
                return gettext("Delete");
            }
            };

        // Views
        // ------------------

        self.showFilamentChangeFlyout = function (tool, forPurge) {
            self.isProfileLocked(false);
            self.tool(tool);
            self.loadedFilamentAmount(self.getAmountString(self.getFilamentAmount(tool)));
            self.filamentInProgress(true);
            self.forPurge(forPurge);

            self.startChangeFilament(tool);

            if (!forPurge) {
                self.filamentActionText(gettext("Swap"));
                self.showUnload();
                slider.noUiSlider.set(FILAMENT_ROLL_LENGTH);

                $('#swap-load-unload').addClass('active');
                $('#swap-info').removeClass('active');
            }
            else {
                $('.swap_process_step').removeClass('active');
                self.filamentActionText(gettext("Purge"));
                self.loadFilament('purge');
            }

            return self.flyout.showFlyout('filament', true)
            .always(function ()  {
                // If this closes we need to reset stuff
                self.filamentLoadProgress(0);
                self.filamentInProgress(false);
                self.selectedTemperatureProfile(undefined);
            })
            .done(self.finishChangeFilament)
            .fail(self.cancelChangeFilament);
        };

        self.lockTemperatureProfile = function (paused_materials) {
            // If it's a paused filament swap, lock the filament material to the one used when starting the print
            var tool = self.tool();

            if (paused_materials.hasOwnProperty(tool)) {
                if (paused_materials[tool] != "None") {
                    var material = self.materialProfiles().find(function (profile) { return profile.name == paused_materials[tool] });
                    self.preselectedTemperatureProfile(material);
                    self.isProfileLocked(true);
                }
            }
        };

        // Below functions swap views for both filament swap and filament detection swap
        self.showUnload = function ()  {
            $('.swap_process_step,.fd_swap_process_step').removeClass('active');
            $('#unload_filament,#fd_unload_filament').addClass('active');
            $('#unload_cmd,#fd_unload_cmd').removeClass('disabled');
            //IntroJS
            if (self.introView.isTutorialStarted) {
                setTimeout(function () { self.introView.introInstance.refresh() }, 200);
                if(self.tool() == "tool1") {
                    self.introView.introInstance.goToStep(self.introView.getStepNumberByName("leftToolFilamentUnload"));
                }
                else{
                    self.introView.introInstance.goToStep(self.introView.getStepNumberByName("rightToolFilamentUnload"));
                }
            }
        };

        self.showLoad = function ()  {
            $('#swap-info,#fd-swap-info').removeClass('active');
            $('#swap-load-unload,#fd-swap-load-unload').addClass('active');
            $('.swap_process_step,.fd_swap_process_step').removeClass('active');
            $('#load_filament,#fd_load_filament').addClass('active');
            self.filamentLoading(false);
            //IntroJS
            if (self.introView.isTutorialStarted) {
                    setTimeout(function () {
                        self.introView.introInstance.refresh()
                    }, 300);
                    if(self.tool() == "tool1") {
                        self.introView.introInstance.goToStep(self.introView.getStepNumberByName("leftToolFilamentSelect"));
                    }
                    else{
                        self.introView.introInstance.goToStep(self.introView.getStepNumberByName("rightToolFilamentSelect"));
                    }
            }
        };

        self.showFinished = function ()  {
            $('#swap-info,#fd-swap-info').removeClass('active')
            $('#swap-load-unload,#fd-swap-load-unload').addClass('active');
            $('.swap_process_step,.fd_swap_process_step').removeClass('active');
            $('#finished_filament,#fd_finished_filament').addClass('active');
            };

        self.onToolHeating = function ()  {
            $('#swap-info,#fd-swap-info').addClass('active');
            $('#swap-load-unload,#fd-swap-load-unload').removeClass('active');
        };

        self.hideToolLoading = function ()  {
            $('#tool_loading,#fd_tool_loading').removeClass('active');
        };

        self.finishedLoading = function ()  {
            // We are finished close the flyout
            //IntroJS
            if(self.introView.isTutorialStarted) {
                setTimeout(function () {
                    self.introView.introInstance.refresh()
                }, 300);
                if(self.tool() == 'tool1'){
                    if(self.toolInfo.getToolByKey('tool0').filament.materialProfileName() == 'None' || self.toolInfo.getToolByKey('tool0').filament.materialProfileName() != 'PLA') {
                        self.introView.introInstance.goToStep(self.introView.getStepNumberByName("rightToolNoFilament"));
                    }
                    else{
                        self.introView.introInstance.goToStep(self.introView.getStepNumberByName("bothToolsLoaded"));
                    }
                }
                else {
                    self.introView.introInstance.goToStep(self.introView.getStepNumberByName("bothToolsLoaded"));
                }
            }
            self.flyout.closeFlyoutAccept();
        };

        self.startChangeFilament = function (tool) {
            return sendToApi("filament/" + tool + "/change/start");
        }

        self.unloadFilament = function () {
            //IntroJS
            if (self.introView.isTutorialStarted) {
                setTimeout(function () {
                    self.introView.introInstance.refresh()
                }, 300);
                if(self.tool() == 'tool1') {
                    self.introView.introInstance.goToStep(self.introView.getStepNumberByName("leftToolFilamentUnloading"));
                }
                else{
                    self.introView.introInstance.goToStep(self.introView.getStepNumberByName("rightToolFilamentUnloading"));
                }
            }
            return sendToApi("filament/" + self.tool() + "/change/unload");
        }

        self.loadFilament = function (loadFor) {

            var loadFor = loadFor || "swap";
            var materialProfileName = undefined;

            if (loadFor == "purge")
                amount = 0;
            else if (slider.noUiSlider.get())
                amount = slider.noUiSlider.get() * 1000;
            else
                amount = 0;

            if (loadFor == "swap")
            {
                var profile = undefined;

                if (self.isProfileLocked())
                    profile = self.preselectedTemperatureProfile();
                else
                    profile = self.selectedTemperatureProfile()

                materialProfileName = profile.name;
            }

            //IntroJS
            if (self.introView.isTutorialStarted) {

                if (self.introView.requiredMaterial != materialProfileName) {



                    return;
                }

                setTimeout(function () {
                    self.introView.introInstance.refresh()
                }, 300);
                if(self.tool() == 'tool1') {
                    self.introView.introInstance.goToStep(self.introView.getStepNumberByName("leftToolFilamentLoading"));
                }
                else{
                    self.introView.introInstance.goToStep(self.introView.getStepNumberByName("rightToolFilamentLoading"));
                }
            }

            return sendToApi("filament/" + self.tool() + "/change/load",
                {
                    loadFor: loadFor,
                    materialProfileName: materialProfileName,
                    amount: amount
                });
        }

        self.finishChangeFilament = function () {
            return sendToApi("filament/" + self.tool() + "/change/finish");
        }

        self.cancelChangeFilament = function () {
            return sendToApi("filament/" + self.tool() + "/change/cancel")
                .done(self.requestData);
        }

        self.updateFilament = function (toolObj) {
            var amount = toolObj.filament.amount();
            var materialProfileName = toolObj.filament.materialProfileName();
            var profile = self.materialProfiles().find(function (profile) { return profile.name == materialProfileName });

            if (profile == undefined) {
                return $.notify({
                title: gettext("Filament updating warning"),
                text: _.sprintf(gettext('Please select a material to update.'))},
                    "warning"
                )
            }

            if (materialProfileName == "None") {
                amount = 0;
            }

            sendToApi("filament/" + toolObj.key(), {
                amount: amount,
                materialProfileName: materialProfileName
            }).done(function () {
                $.notify({
                    title: gettext("Filament information updated"),
                    text: _.sprintf(gettext('New material: %(material)s. New amount: %(amount)s'), { material: materialProfileName, amount: self.getAmountString(amount) })
                },
                    "success"
                );

            }).fail(function () {
                $.notify({
                    title: gettext("Filament information updated failed"),
                    text: _.sprintf(gettext('Please check the logs for more info.'))
                },
                    "error"
                )
            });


        }

        self.startHeating = function (tool) {
            tool = tool || self.tool();

            if (self.getFilamentMaterial(tool) == "None")
                return;

            sendToApi("filament/" + tool + "/heat/start");
        }

        self.finishHeating = function (tool) {
            tool = tool || self.tool();

            sendToApi("filament/" + tool + "/heat/finish");
        }

        self.startExtruding = function (tool) {
            tool = tool || self.tool();

            if (self.getFilamentMaterial(tool) == "None")
                return;

            sendToApi("filament/" + tool + "/extrude/start",
                {
                    direction: 1
                });
        }

        self.finishExtruding = function (tool) {
            tool = tool || self.tool();
            sendToApi("filament/" + tool + "/extrude/finish");
        }

        self.startRetracting = function (tool) {
            tool = tool || self.tool();

            if (self.getFilamentMaterial(tool) == "None")
                return;

            sendToApi("filament/" + tool + "/extrude/start",
                {
                    direction: -1
                });
        }

        self.finishRetracting = function (tool) {
            tool = tool || self.tool();
            sendToApi("filament/" + tool + "/extrude/finish");
        }

        // Handle plugin messages
        self.onDataUpdaterPluginMessage = function (plugin, data) {
            if (plugin != "lui") {
                return;
            }

            var messageType = data['type'];
            var messageData = data['data'];
            switch (messageType) {
                case "filament_change_started":
                    self.filamentInProgress(true);

                    if (messageData && messageData.hasOwnProperty('paused_materials'))
                        self.lockTemperatureProfile(messageData['paused_materials'])

                    break;
                case "filament_change_cancelled":
                    self.filamentInProgress(false);
                    self.filamentLoading(false);
                    self.filamentLoadProgress(0);

                    if (!self.forPurge()) {
                        $.notify({
                            title: gettext("Filament loaded aborted!"),
                            text: _.sprintf(gettext('Please re-run load filament procedure'), {})
                        },
                                        "warning"
                                    );
                    }
                    self.requestData();
                    break;
                case "filament_load_progress":
                    // Used for both loading and unloading
                    self.filamentInProgress(true);
                    self.filamentLoadProgress(messageData.progress);
                    break;
                case "filament_unload_started":
                    self.filamentLoadingText(gettext("Unloading filament..."));
                    break;
                case "filament_unload_finished":
                    self.showLoad();
                    break;
                case "filament_load_started":
                    self.filamentLoadingText(gettext("Loading filament..."));
                    break;
                case "filament_load_finished":
                    self.filamentInProgress(false);
                    self.filamentLoading(false);
                    self.showFinished();
                    self.hideToolLoading();
                    //IntroJS
                    if (self.introView.isTutorialStarted) {
                        tool = self.tool();
                        profile = self.selectedTemperatureProfile();
                        if (tool == 'tool1') {
                            if(profile.name == 'None') {
                                self.introView.introInstance.goToStep(self.introView.getStepNumberByName("leftToolNoFilament"));
                            }
                            else {
                                self.introView.introInstance.goToStep(self.introView.getStepNumberByName("leftToolFilamentDone"));
                            }
                        }
                        else {
                            if(profile.name == 'None'){
                                self.introView.introInstance.goToStep(self.introView.getStepNumberByName("rightToolNoFilament"));
                            }
                            else {
                                self.introView.introInstance.goToStep(self.introView.getStepNumberByName("rightToolFilamentDone"));
                            }
                        }
                    }
                    self.filamentLoadProgress(0);
                    if (!messageData.profile) {
                        self.flyout.closeFlyoutAccept();
                    }
                    self.requestData();
                    break;
                case "tool_heating":
                    self.filamentInProgress(true);
                    self.filamentLoading(true);
                    self.filamentLoadProgress(0);
                    self.onToolHeating();
                    break;
                case "filament_extruding_started":
                    var filament = self.getFilament(messageData["tool"]);

                    if (filament) {
                        if (messageData["direction"] == 1)
                            filament.isExtruding(true);
                        else if (messageData["direction"] == -1)
                            filament.isRetracting(true);
                    }
                    break;
                case "filament_extruding_finished":
                    var filament = self.getFilament(messageData["tool"]);

                    if (filament) {
                        if (messageData["direction"] == 1)
                            filament.isExtruding(false);
                        else if (messageData["direction"] == -1)
                            filament.isRetracting(false);
                    }
                    break;
                case "update_filament_amount":
                    var amounts = messageData.filament;
                    for (var i = 0; i < amounts.length; i++)
                        self.setFilamentAmount("tool" + i, amounts[i]);
                    break;

            }
        };


        self.copyMaterialProfiles = function ()  {
            // Copy the settings materials and add a "None" profile
            self.materialProfiles(self.settings.temperature_profiles.slice(0));
            self.materialProfiles.unshift({
                bed: 0,
                extruder: 0,
                name: "None"
            });
        };

        self.onBeforeBinding = function () {
            self.requestData();
            self.tool("tool0");
            self.copyMaterialProfiles();
        };

        self.onEventSettingsUpdated = function ()  {
            self.copyMaterialProfiles();
        };


        self.fromResponse = function (data) {
            if (data.filaments) {
                var tools = self.tools();

                for (i = 0; i < tools.length; i++) {
                    // Back-end provides a sorted list, so we may use indices here
                    tools[i].filament.materialProfileName(data.filaments[i].materialProfileName);
                    tools[i].filament.amount(data.filaments[i].amount);
                }
            }
        };

        self.requestData = function ()  {
            getFromApi("filament").done(self.fromResponse);
        };

        self.onMaterialsSettingsShown = function () {
            self.requestData();
        };

        self.abortFilament = function () {
            self.flyout.closeFlyout();
            //IntroJS
            if (self.introView.isTutorialStarted) {
                setTimeout(function () {
                    self.introView.introInstance.refresh();
                }, 300);
                tool = self.tool();
                if (tool == 'tool1') {
                    self.introView.introInstance.goToStep(self.introView.getStepNumberByName("leftToolNoFilament"));
                }
                else {
                    self.introView.introInstance.goToStep(self.introView.getStepNumberByName("rightToolNoFilament"));
                }
            }
        };

        self.onFilamentIntroExit = function () {
            self.abortFilament();
        }
    }

    OCTOPRINT_VIEWMODELS.push([
      FilamentViewModel,
      ["loginStateViewModel", "settingsViewModel", "flyoutViewModel", "printerStateViewModel", "toolInfoViewModel", "introViewModel"],
      ["#filament_status", "#filament_flyout", "#materials_settings_flyout_content"]
    ]);

});
