$(function ()  {
    function IntroViewModel(parameters) {
        var self = this;

        self.isTutorialStarted = false;
        self.isFirstStep = false;
        self.lastStep = 0;

        self.flyout = parameters[0];
        self.toolInfo = parameters[1];

        self.allViewModels = undefined;

        self.requiredMaterial = 'PLA';

        self.introInstance = introJs('#introjs-container');

        var firstPrintSteps = [
            {
                //1
                stepName: "helloStep",
                intro: "<div class=\"step-header\">" + gettext("Your First Print") + "<a class=\"exit-button\" data-bind=\"touchClick: " +
                "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                "<div class=\"step-text\">" + gettext("<b>Welcome to your new Leapfrog Bolt 3D printer.</b><br />This tutorial will guide you through " +
                    "the steps you have to take to start printing your creations.<br />") +
                "<div class=\"introjs-tooltipbuttons\"><a id=\"nextButton\" role=\"button\"" +
                "class=\"introjs-button next-button\" data-bind=\"touchClick: function (){ beginButton() }\">" + gettext("Continue") + "</a>" +
                "<a id=\"cancelButton\" role=\"button\" class=\"introjs-button\"" +
                "data-bind=\"touchClick: function (){ cancelButton() }\">"+ gettext("Cancel") + "</a></div></div>"
            },
            {
                //2
                stepName: "leftToolNoFilament",
                element: '#tool1',
                intro: "<div class=\"step-header\">" + gettext("Your First Print") + "<a class=\"exit-button\" data-bind=\"touchClick: " +
                "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                "<div class=\"step-text\">" + gettext("For our first print, we need PLA filament in both extruders. " +
                    "Press <i class=\"fa fa-refresh\">" +
                    "</i><b> Swap left</b> to load filament in the left extruder.") + "</div>",
                position: 'top'
            },
            {
                //3
                stepName: "leftToolFilamentUnload",
                element: '#filament_loading',
                intro: "<div class=\"step-header\">" + gettext("Your First Print") + "<a class=\"exit-button\" data-bind=\"touchClick: " +
                "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                "<div class=\"step-text\">" + gettext("First we have to unload the non PLA filament. " +
                    "Press <i class=\"fa fa-arrow-up\">" +
                    "</i><b> Unload</b> to unload filament from the left extruder.") + "</div>",
                position: 'bottom'
            },
            {
                //4
                stepName: "leftToolFilamentUnloading",
                element: '#filament_loading',
                intro: "<div class=\"step-header\">" + gettext("Your First Print") + "<a class=\"exit-button\" data-bind=\"touchClick: " +
                "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                "<div class=\"step-text\">" + gettext("The left extruder is now unloading the filament. When something goes" +
                    " wrong you can press Abort to cancel the process.") + "</div>",
                position: 'bottom'
            },
            {
                //5
                stepName: "leftToolFilamentSelect",
                element: '#filament_loading',
                intro: "<div class=\"step-header\">" + gettext("Your First Print") + "<a class=\"exit-button\" data-bind=\"touchClick: " +
                "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                "<div class=\"step-text\">" + gettext("Select PLA as filament material and provide the approximate " +
                    "amount that is on the spool. This way the printer knows what kind of filament you want to load.") + "</div>",
                position: 'bottom',
                tooltipClass: "tooltip_hidden"
            },
            {
                //6
                stepName: "leftToolFilamentLoading",
                element: '#filament_loading',
                intro: "<div class=\"step-header\">" + gettext("Your First Print") + "<a class=\"exit-button\" data-bind=\"touchClick: " +
                "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                "<div class=\"step-text\">" + gettext("The left extruder is now loading your filament. When something goes" +
                    " wrong you can press Abort to cancel the process.") + "</div>",
                position: 'bottom'
            },
            {
                //7
                stepName: "leftToolFilamentDone",
                element: '#finished_filament',
                intro: "<div class=\"step-header\">" + gettext("Your First Print") + "<a class=\"exit-button\" data-bind=\"touchClick: " +
                "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                "<div class=\"step-text\">" + gettext("We are now done loading filament in the left extruder. If you are not satisfied" +
                    " with the amount of filament that came out of the nozzle, you can press <b>Extrude more filament</b>." +
                    "If you are ready for the next step, press <b>Done</b>.") + "</div>"
            },
            {
                //8
                stepName: "rightToolNoFilament",
                element: '#tool0',
                intro: "<div class=\"step-header\">" + gettext("Your First Print") + "<a class=\"exit-button\" data-bind=\"touchClick: " +
                "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                "<div class=\"step-text\">" + gettext("For our first print, we also need PLA filament in the right extruder. " +
                    "Press <i class=\"fa fa-refresh\"></i><b> Swap right </b> to load filament in the right extruder.") + "</div>",
                position: 'top'
            },
            {
                //9
                stepName: "rightToolFilamentUnload",
                element: '#filament_loading',
                intro: "<div class=\"step-header\">" + gettext("Your First Print") + "<a class=\"exit-button\" data-bind=\"touchClick: " +
                "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                "<div class=\"step-text\">" + gettext("First we have to unload the non PLA filament. " +
                    "Press <i class=\"fa fa-arrow-up\">" +
                    "</i><b>Unload</b> to unload filament from the right extruder.") + "</div>",
                position: 'bottom'
            },
            {
                //10
                stepName: "rightToolFilamentUnloading",
                element: '#filament_loading',
                intro: "<div class=\"step-header\">" + gettext("Your First Print") + "<a class=\"exit-button\" data-bind=\"touchClick: " +
                "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                "<div class=\"step-text\">" + gettext("The right extruder is now unloading the filament. When something goes" +
                    " wrong you can press Abort to cancel the process.") + "</div>",
                position: 'bottom'
            },
            {
                //11
                stepName: "rightToolFilamentSelect",
                element: '#filament_loading',
                intro: "<div class=\"step-header\">" + gettext("Your First Print") + "<a class=\"exit-button\" data-bind=\"touchClick: " +
                "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                "<div class=\"step-text\">" + gettext("Select PLA as filament material and provide the approximate " +
                    "amount that is on the spool. This way the printer knows what kind of filament you want to load.") + "</div>",
                position: 'bottom',
                tooltipClass: "tooltip_hidden"
            },
            {
                //12
                stepName: "rightToolFilamentLoading",
                element: '#filament_loading',
                intro: "<div class=\"step-header\">" + gettext("Your First Print") + "<a class=\"exit-button\" data-bind=\"touchClick: " +
                "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                "<div class=\"step-text\">" + gettext("The right extruder is loading filament. " +
                "When something goes wrong you can press Abort to cancel the process.") + "</div>",
                position: 'bottom'
            },
            {
                //13
                stepName: "rightToolFilamentDone",
                element: '#finished_filament',
                intro: "<div class=\"step-header\">" + gettext("Your First Print") + "<a class=\"exit-button\" data-bind=\"touchClick: " +
                "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                "<div class=\"step-text\">" + gettext("We are now done loading filament. If you are not " +
                    "satisfied with the amount of filament that came out of the nozzle, you can press <b>Extrude more filament</b>. " +
                    "If you are ready for the next step, press <b>Done</b>.") + "</div>"
            },
            {
                //14
                stepName: "bothToolsLoaded",
                intro: "<div class=\"step-header\">" + gettext("Your First Print") + "<a class=\"exit-button\" data-bind=\"touchClick: " +
                "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                "<div class=\"step-text\">" + gettext("There is filament detected in both extruders. We will now" +
                    " calibrate the printer to make sure that the bed and the extruders are aligned.") +
                "</div><div class=\"introjs-tooltipbuttons\"><a id=\"nextButton\" role=\"button\"" +
                " class=\"introjs-button\" data-bind=\"touchClick: function (){ goToStepButton(getStepNumberByName('goToMaintenance')) }\">" + gettext("Next") + "</a></div></div>"
            },
            {
                //15
                stepName: "goToMaintenance",
                element: '#maintenance',
                intro: "<div class=\"step-header\">" + gettext("Your First Print") + "<a class=\"exit-button\" data-bind=\"touchClick: " +
                "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                "<div class=\"step-text\">" + gettext("The calibration wizard is located in the maintenance flyout. " +
                    "To go there, press <i class=\"fa fa-wrench\"></i><b>Maintenance</b>.") + "</div>",
                position: 'bottom'
            },
            {
                //16
                stepName: "goToCalibrateBed",
                element: '#bed_calibrate',
                intro: "<div class=\"step-header\">" + gettext("Your First Print") + "<a class=\"exit-button\" data-bind=\"touchClick: " +
                "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                "<div class=\"step-text\">" + gettext("First we will calibrate the bed. This will " +
                    "make sure the printed object will adhere to the bed. Press <b>Calibrate bed</b> to continue.") + "</div>",
                position: 'top'
            },
            {
                //17
                stepName: "continueBedCalibration",
                element: $('#bedcalibration_flyout_content').find('.ok-button')[0],
                intro: "<div class=\"step-header\">" + gettext("Your First Print") + "<a class=\"exit-button\" data-bind=\"touchClick: " +
                "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                "<div class=\"step-text\">" + gettext("Before pressing <b>Continue calibration</b>, check that the print bed is empty.") + "</div>",
                position: 'top'
            },
            {
                //18
                stepName: "calibrateBed",
                element: '#bed_calibration',
                intro: "<div class=\"step-header\">" + gettext("Your First Print") + "<a class=\"exit-button\" data-bind=\"touchClick: " +
                "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                "<div class=\"step-text\">" + gettext("When the bed is level, press <b>Done</b> to continue.") + "</div>",
                position: 'top',
                tooltipClass: 'tooltip_hidden'
            },
            {
                //19
                stepName: "goToCalibrateExtruders",
                element: $('#maintenance_control').find('.button')[2],
                intro: "<div class=\"step-header\">" + gettext("Your First Print") + "<a class=\"exit-button\" data-bind=\"touchClick: " +
                "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                "<div class=\"step-text\">" + gettext("To align the extruders, press <b>Calibrate extruders</b>." +
                    " This will start the extruder calibration wizard.") + "</div>",
                position: 'bottom'
            },
            {
                //20
                stepName: "startLargeCalibration",
                element: '#start-large-extruder-calibration',
                intro: "<div class=\"step-header\">" + gettext("Your First Print") + "<a class=\"exit-button\" data-bind=\"touchClick: " +
                "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                "<div class=\"step-text\">" + gettext("The calibration wizard will calibrate the Y axis in one step and the X axis in two steps. To start the first calibration print, press <b>Start calibration</b>.") + "</div>",
                position: 'bottom'
            },
            {
                //21
                stepName: "printingLargeCalibration",
                element: '#printing-extruder-calibration',
                intro: "<div class=\"step-header\">" + gettext("Your First Print") + "<a class=\"exit-button\" data-bind=\"touchClick: " +
                "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                "<div class=\"step-text\">" + gettext("The printer is now printing the first X axis calibration print. " +
                "This allows to calibrate the X axis with a precision of 1 mm.") + "</div>",
                position: 'bottom'
            },
            {
                //22
                stepName: "largeCalibrationDone",
                element: '#large-calibration',
                intro: "<div class=\"step-header\">" + gettext("Your First Print") + "<a class=\"exit-button\" data-bind=\"touchClick: " +
                "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                "<div class=\"step-text\">" + gettext("Select the best aligned vertical line on the bed. Then, press <b>Next</b>.") + "</div>",
                position: 'bottom'
            },
            {
                //23
                stepName: "startSmallCalibration",
                element: '#start-small-extruder-calibration',
                intro: "<div class=\"step-header\">" + gettext("Your First Print") + "<a class=\"exit-button\" data-bind=\"touchClick: " +
                "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                "<div class=\"step-text\">" + gettext("Now we will start the second calibration print. This will allow to calibrate both the X and Y axes with a precision of 0.1 mm.") + "</div>",
                position: 'bottom'
            },
            {
                //24
                stepName: "printingSmallCalibration",
                element: '#printing-extruder-calibration',
                intro: "<div class=\"step-header\">" + gettext("Your First Print") + "<a class=\"exit-button\" data-bind=\"touchClick: " +
                "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                "<div class=\"step-text\">" + gettext("The printer is now printing the second calibration print.") + "</div>",
                position: 'bottom'
            },
            {
                //25
                stepName: "selectXSmall",
                element: '#x-small-calibration',
                intro: "<div class=\"step-header\">" + gettext("Your First Print") + "<a class=\"exit-button\" data-bind=\"touchClick: " +
                "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                "<div class=\"step-text\">" + gettext("Select the best aligned vertical line on the bed. Then, press <b>Next</b>.") + "</div>",
                position: 'bottom'
            },
            {
                //26
                stepName: "selectYSmall",
                element: '#y-small-calibration',
                intro: "<div class=\"step-header\">" + gettext("Your First Print") + "<a class=\"exit-button\" data-bind=\"touchClick: " +
                "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                "<div class=\"step-text\">" + gettext("Select the best aligned hortizontal line on the bed. " +
                "Then, press <b>Next</b>.") + "</div>",
                position: 'bottom'
            },
            {
                //27
                stepName: "selectPrintJob",
                element: $('.print_status').find('.button-area')[0],
                intro: "<div class=\"step-header\">" + gettext("Your First Print") + "<a class=\"exit-button\" data-bind=\"touchClick: " +
                "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                "<div class=\"step-text\">" + gettext("Good job, the printer is now calibrated and ready to print. " +
                    "Now we will select the demo print job (the GCODE file) for the printer. To select the print job, " +
                    "press <i class=\"fa fa-file\"></i> <b>Select print job</b>.") + "</div>"
            },
            {
                //28
                stepName: "browseLocal",
                element: $('.browse_modes').find('.load-button')[0],
                intro: "<div class=\"step-header\">" + gettext("Your First Print") + "<a class=\"exit-button\" data-bind=\"touchClick: " +
                "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                "<div class=\"step-text\">" + gettext("Now we can select a GCODE file that's saved on the printer. " +
                "There is a sample print you can try out.") + "</div>"
            },
            {
                //29
                stepName: "selectFile",
                element: '#print_files',
                intro: "<div class=\"step-header\">" + gettext("Your First Print") + "<a class=\"exit-button\" data-bind=\"touchClick: " +
                "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                "<div class=\"step-text\">" + gettext("Select the file and press on the <i class=\"fa fa-play\">" +
                "</i> button next to it.") + "</div>"
            },
            {
                //30
                stepName: "selectPrintMode",
                element: '#mode_select',
                intro: "<div class=\"step-header\">" + gettext("Your First Print") + "<a class=\"exit-button\" data-bind=\"touchClick: " +
                "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                "<div class=\"step-text\">" + gettext("Select one of the print modes. When you're ready, press <b>Start " +
                    "print</b> or if you're not, press <b>Cancel</b>.") + "</div>",
                position: 'bottom'
            },
            {
                 //31
                stepName: "leftToolWrongFilament",
                intro: "<div class=\"step-header\">" + gettext("Your First Print") + "<a class=\"exit-button\" data-bind=\"touchClick: " +
                "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                "<div class=\"step-text\">" + gettext("Please select PLA filament when loading the filament.<br>") +
                "<a id=\"nextButton\" style=\"left:25%;\" role=\"button\" class=\"introjs-button\" data-bind=\"touchClick: function (){ goToStepButton(getStepNumberByName('leftToolFilamentSelect')) }\">"  + gettext("Continue") + "</a></div>"
            },
            {
                 //32
                stepName: "rightToolWrongFilament",
                intro: "<div class=\"step-header\">" + gettext("Your First Print") + "<a class=\"exit-button\" data-bind=\"touchClick: " +
                "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                "<div class=\"step-text\">" + gettext("Please select PLA filament when loading the filament.<br>") +
                "<a id=\"nextButton\" style=\"left:25%;\" role=\"button\" class=\"introjs-button\" data-bind=\"touchClick: function (){ goToStepButton(getStepNumberByName('rightToolFilamentSelect')) }\">"  + gettext("Continue") + "</a></div>"
            },
            {
                //33
                stepName: "tutorialDone",
                intro: "<div class=\"step-header\">" + gettext("Your First Print") + "<a class=\"exit-button\" data-bind=\"touchClick: " +
                "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                "<div class=\"step-text\">" + gettext("Good Job!<br>The printer is now printing the first print. " +
                "Watch how the object magically appears in  front of you.<br>") +
                "<div class=\"introjs-tooltipbuttons\"><a id=\"doneButton\" role=\"button\" class=\"introjs-button\"" +
                "data-bind=\"touchClick: function(){ doneButton() }\">" + gettext("Done") + "</a></div></div>"
            }
        ];

        //IntroJS Callback Functions
        self.introInstance.onbeforechange(function() {
            switch (self.currentStep()){
                case 1: self.introInstance.refresh();
                        $('#print_icon').mousedown();
                        self.isFirstStep = true;
                    break;
                case 5: $(".introjs-progress").css("display","inherit");
                        $('#material-select').bind("change", self.refreshElements);
                    break;
                case 6: $('#material-select').unbind("change", self.refreshElements);
                    break;
                case 6: $('#material-select').unbind("change", self.refreshElements);
                    break;
                case 11: $(".introjs-progress").css("display","inherit");
                        $('#material-select').bind("change", self.refreshElements);
                    break;
                case 12: $('#material-select').unbind("change", self.refreshElements);
                    break;
                case 12: $('#material-select').unbind("change", self.refreshElements);
                    break;
                case 15: self.introInstance.refresh();
                         $('#settings_icon').mousedown();
                    break;
                case 27: self.introInstance.refresh();
                         $('#print_icon').mousedown();
                    break;
            }
        });

        self.introInstance.onafterchange(function () {
            var step = self.currentStep();
            if(self.lastStep != step) {
                var element = document.getElementById('introjs-container');
                if(!ko.utils.domData.get(element, "__ko_boundElement")) {
                    // We need to wait until the button click event completed before the DOM is updated
                    setTimeout(function () {
                        ko.cleanNode(element);
                        ko.applyBindings(self, element);
                    }, 0);
                }
                self.lastStep = step;
            }
            switch (self.currentStep()){
                case 31: $(".introjs-progress").css("display","none");
                    break;
                case 32: $(".introjs-progress").css("display","none");
                    break;
            }
        });

        //Own functions
        self.startIntro = function (introName) {
            //Starts the intro
            self.isTutorialStarted = true;
            switch (introName){
                case "firstPrint":
                    self.introInstance.setOptions({
                        steps: firstPrintSteps,
                        showStepNumbers: false,
                        showProgress: true,
                        scrollToElement: true,
                        exitOnOverLayClick: false,
                        showBullets: false,
                        showButtons: false,
                        keyboardNavigation: true
                    });
                    self.introInstance.start();
                    break;
            }
        };

        self.goToStepButton = function (step) {
            self.introInstance.goToStep(step);
            self.introInstance.refresh();
        };

        self.beginButton = function () {
            //Check if filament is loaded and skips steps when not needed.
            if(self.currentStep() == 1){
                sendToApi('printer/had_first_start');
                FIRST_START = false;
                self.isFirstStep = false;
            }

            if (self.toolInfo.getToolByKey('tool0').filament.materialProfileName() == self.requiredMaterial && self.toolInfo.getToolByKey('tool1').filament.materialProfileName() == self.requiredMaterial) {
                self.introInstance.goToStep(self.getStepNumberByName("bothToolsLoaded"));
            }
            else if (self.toolInfo.getToolByKey('tool0').filament.materialProfileName() != self.requiredMaterial && self.toolInfo.getToolByKey('tool1').filament.materialProfileName() == self.requiredMaterial) {
                self.introInstance.goToStep(self.getStepNumberByName("rightToolNoFilament"));
            }
            else {
                self.introInstance.goToStep(self.getStepNumberByName("leftToolNoFilament"));
            }
        };

        self.cancelButton = function () {
            //Cancels the intro, sends to backend that intro has run.
            if(self.currentStep() == 1 && self.isFirstStep == true){
                sendToApi('printer/had_first_start');
                FIRST_START = false;
                self.isFirstStep = false;
            }
            self.isTutorialStarted = false;
            self.introInstance.exit();
            self.lastStep = 0;
        };

        self.doneButton = function () {
            //Stops intro and resets flags
            self.isTutorialStarted = false;
            self.introInstance.exit();
            self.lastStep = 0;
        };

        self.exitButton = function () {
            var step = self.currentStep();

            self.isTutorialStarted = false;

            switch (true) {
                //Extruder Calibration Exit
                case (step > 19 && step < 27):
                    callViewModels(self.allViewModels, 'onExtruderCalibrationIntroExit');
                    self.flyout.closeFlyout();
                    break;
                case (step == 20):
                    self.flyout.closeFlyout();
                    self.flyout.closeFlyout();
                    $('#print_icon').mousedown();
                    break;
                //Swap Filament Exit
                case (step > 2 && step < 8 || step > 8 && step < 14):
                    callViewModels(self.allViewModels, 'onFilamentIntroExit');
                    break;
                //Bed Calibration Exit
                case (step == 17 || step == 18 ):
                    callViewModels(self.allViewModels, 'onBedCalibrationIntroExit');
                    self.flyout.closeFlyout();
                    break;
                // Maintenance Flyout Exit
                case (step == 16 || step == 23):
                    self.flyout.closeFlyout();
                    $('#print_icon').mousedown();
                    break;
                // Print Flyout Exit
                case (step == 30):
                    sendToApi("printer/immediate_cancel");
                    self.flyout.closeFlyout();
                    break;
                case (step == 31 || step == 32):
                    $('#material-select').unbind("change");
                    break;
                // For other steps
                default : $('#print_icon').mousedown();
                    break;
            }
            self.lastStep = 0;
            self.introInstance.exit();
        };

        self.currentStep = function () {
            return self.introInstance._currentStep+1;
        };

        self.getStepNumberByName = function (stepName) {
            return self.introInstance._introItems.find(x => x.stepName.toUpperCase() === stepName.toUpperCase()).step;
        };

        self.onShutdownOrDisconnectFlyout = function () {
          self.introInstance.exit();
        };

        self.refreshElements = function () {
            self.introInstance.refresh();
        };

        self.onAllBound = function(allViewModels) {
            self.allViewModels = allViewModels;
        };
    }
    // This is how our plugin registers itself with the application, by adding some configuration
    // information to the global variable ADDITIONAL_VIEWMODELS
    ADDITIONAL_VIEWMODELS.push([
        // This is the constructor to call for instantiating the plugin
        IntroViewModel,

        // This is a list of dependencies to inject into the plugin, the order which you request
        // here is the order in which the dependencies will be injected into your view model upon
        // instantiation via the parameters argument
        [ "flyoutViewModel", "toolInfoViewModel"],

        // Finally, this is the list of all elements we want this view model to be bound to.
        [ ]
    ]);
});
