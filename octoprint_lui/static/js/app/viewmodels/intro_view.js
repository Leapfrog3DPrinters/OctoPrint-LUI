$(function ()  {
    function IntroViewModel(parameters) {
        var self = this;

        self.isTutorialStarted = false;
        self.isFirstStep = false;

        self.flyout = parameters[0];
        self.toolInfo = parameters[1];

        self.allViewModels = undefined;

        self.introInstance = introJs('#introjs-container');

        var firstPrintSteps = [
                {
                    //1 +
                    intro: "<div class=\"step-header\">Your First Print<a class=\"exit-button\" data-bind=\"click: " +
                    "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                    "<div class=\"step-text\"><b>Welcome to your new Bolt.</b><br>This tutorial will guide you through the" +
                    " steps you have to take to start printing your creations.<br>" +
                    "<div class=\"introjs-tooltipbuttons\"><a id=\"nextButton\" role=\"button\"" +
                    "class=\"introjs-button next-button\" data-bind=\"click: function (){ beginButton() }\">Begin</a>" +
                    "<a id=\"cancelButton\" role=\"button\" class=\"introjs-button\"" +
                    "data-bind=\"click: function (){ cancelButton() }\">Cancel</a></div></div>"
                },
                {
                    //2 +
                    element: '#tool1',
                    intro: "<div class=\"step-header\">Your First Print<a class=\"exit-button\" data-bind=\"click: " +
                    "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                    "<div class=\"step-text\">There is not filament loaded in the left extruder. We will have to " +
                    "load some filament in this extruder to be able to print. Click <i class=\"fa fa-refresh\"></i> <b> Swap Left</b> " +
                    "to load the filament in the left extruder.</div>",
                    position: 'top'
                },
                {
                    //3 +
                    element: '#filament_loading',
                    intro: "<div class=\"step-header\">Your First Print<a class=\"exit-button\" data-bind=\"click: " +
                    "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                    "<div class=\"step-text\">Choose what kind of material you are loading and give the amount " +
                    "that you are loading. This way the printer knows what it's using.</div>",
                    position: 'bottom',
                    tooltipClass: "tooltip_hidden"
                },
                {
                    //4 +
                    element: '#filament_loading',
                    intro: "<div class=\"step-header\">Your First Print<a class=\"exit-button\" data-bind=\"click: " +
                    "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                    "<div class=\"step-text\">The left extruder is now being loaded. When something goes wrong you can press " +
                    "Abort to cancel the action.</div>",
                    position: 'bottom'
                },
                {
                    //5 +
                    element: '#filament_loading',
                    intro: "<div class=\"step-header\">Your First Print<a class=\"exit-button\" data-bind=\"click: " +
                    "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                    "<div class=\"step-text\">We are now done loading the left filament. If your not satisfied with the " +
                    "amount that came out of the nozzle you can press <b>Extrude More</b>. If you are ready for " +
                    "the next step press <b>Done</b>.</div>"
                },
                {
                    //6 +
                    element: '#tool0',
                    intro: "<div class=\"step-header\">Your First Print<a class=\"exit-button\" data-bind=\"click: " +
                    "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                    "<div class=\"step-text\">There is not filament loaded in the right extruder. We will have to " +
                    "load some filament in this extruder to be able to print. Click <i class=\"fa fa-refresh\"></i> <b> Swap Right</b> " +
                    "to load the filament in the right extruder.</div>",
                    position: 'top'
                },
                {
                    //7 +
                    element: '#filament_loading',
                    intro: "<div class=\"step-header\">Your First Print<a class=\"exit-button\" data-bind=\"click: " +
                    "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                    "<div class=\"step-text\">Choose what kind of material you are loading and give the amount " +
                    "that you are loading. This way the printer knows what kind of filament you want to load.</div>",
                    position: 'bottom',
                    tooltipClass: "tooltip_hidden"
                },
                {
                    //8 +
                    element: '#filament_loading',
                    intro: "<div class=\"step-header\">Your First Print<a class=\"exit-button\" data-bind=\"click: " +
                    "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                    "<div class=\"step-text\">The right extruder is being loaded. When something goes wrong you can press " +
                    "Abort to cancel the action.</div>",
                    position: 'bottom'
                },
                {
                    //9 +
                    element: '#filament_loading',
                    intro: "<div class=\"step-header\">Your First Print<a class=\"exit-button\" data-bind=\"click: " +
                    "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                    "<div class=\"step-text\">We are now done loading the right filament. If your not satisfied with the " +
                    "amount that came out of the nozzle you can press <b>Extrude More</b>. If you are ready for " +
                    "the next step press <b>Done</b>.</div>"
                },
                {
                    //10 +
                    intro: "<div class=\"step-header\">Your First Print<a class=\"exit-button\" data-bind=\"click: " +
                    "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                    "<div class=\"step-text\">There is filament in both the extruders. Now we can calibrate the printer to make sure that the bed and" +
                    " the extruders are aligned</div><div class=\"introjs-tooltipbuttons\"><a id=\"nextButton\" role=\"button\"" +
                    "class=\"introjs-button\" data-bind=\"click: function (){ goToStepButton(11) }\">Next</a></div></div>"
                },
                {
                    //11 +
                    element: '#maintenance',
                    intro: "<div class=\"step-header\">Your First Print<a class=\"exit-button\" data-bind=\"click: " +
                    "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                    "<div class=\"step-text\">To get to the maintenance menu, click on <i class=\"fa fa-wrench\"></i><b> Maintenance</b>.</div>",
                    position: 'bottom'
                },
                {
                    //12 +
                    element: '#bed_calibrate',
                    intro: "<div class=\"step-header\">Your First Print<a class=\"exit-button\" data-bind=\"click: " +
                    "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                    "<div class=\"step-text\">To calibrate the bed, click on <b>Calibrate bed</b>.</div>",
                    position: 'top'
                },
                {
                    //13 +
                    element: $('#bedcalibration_flyout_content').find('.ok-button')[0],
                    intro: "<div class=\"step-header\">Your First Print<a class=\"exit-button\" data-bind=\"click: " +
                    "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                    "<div class=\"step-text\">Check if the printbed is empty, when it is click on <b>Continue calibration</b>.</div>",
                    position: 'top'
                },
                {
                    //14 +
                    element: '#bed_calibration',
                    intro: "<div class=\"step-header\">Your First Print<a class=\"exit-button\" data-bind=\"click: " +
                    "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                    "<div class=\"step-text\">When you have calibrated the bed, press <b>Close</b>.</div>",
                    position: 'top',
                    tooltipClass: 'tooltip_hidden'
                },
                {
                    //15 +
                    element: $('#maintenance_control').find('.button:contains(\'Calibrate extruders\')')[0],
                    intro: "<div class=\"step-header\">Your First Print<a class=\"exit-button\" data-bind=\"click: " +
                    "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                    "<div class=\"step-text\">To align the extruders, press <b>Calibrate extruders</b>.</div>",
                    position: 'bottom'
                },
                {
                    //16 +
                    element: '#start-large-extruder-calibration',
                    intro: "<div class=\"step-header\">Your First Print<a class=\"exit-button\" data-bind=\"click: " +
                    "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                    "<div class=\"step-text\">To the extruder calibration, press <b>Start calibration</b>.</div>",
                    position: 'bottom'
                },
                {
                    //17 +
                    element: '#printing-extruder-calibration',
                    intro: "<div class=\"step-header\">Your First Print<a class=\"exit-button\" data-bind=\"click: " +
                    "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                    "<div class=\"step-text\">Printing large calibration.</div>",
                    position: 'bottom'
                },
                {
                    //18 +
                    element: '#large-calibration',
                    intro: "<div class=\"step-header\">Your First Print<a class=\"exit-button\" data-bind=\"click: " +
                    "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                    "<div class=\"step-text\">Select the best aligned line, press Next</div>",
                    position: 'bottom'
                },
                {
                    //19 +
                    element: '#start-small-extruder-calibration',
                    intro: "<div class=\"step-header\">Your First Print<a class=\"exit-button\" data-bind=\"click: " +
                    "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                    "<div class=\"step-text\">Start small calibration</div>",
                    position: 'bottom'
                },
                {
                    //20 +
                    element: '#printing-extruder-calibration',
                    intro: "<div class=\"step-header\">Your First Print<a class=\"exit-button\" data-bind=\"click: " +
                    "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                    "<div class=\"step-text\">Printing small calibration</div>",
                    position: 'bottom'
                },
                {
                    //21 +
                    element: '#x-small-calibration',
                    intro: "<div class=\"step-header\">Your First Print<a class=\"exit-button\" data-bind=\"click: " +
                    "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                    "<div class=\"step-text\">Select the best aligned line x, press Next</div>",
                    position: 'bottom'
                },
                {
                    //22 +
                    element: '#y-small-calibration',
                    intro: "<div class=\"step-header\">Your First Print<a class=\"exit-button\" data-bind=\"click: " +
                    "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                    "<div class=\"step-text\">Select the best aligned line y, press Next</div>",
                    position: 'bottom'
                },
                {
                    //23 +
                    element: $('.print_status').find('.button-area')[0],
                    intro: "<div class=\"step-header\">Your First Print<a class=\"exit-button\" data-bind=\"click: " +
                    "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                    "<div class=\"step-text\">Good Job, The printer is now calibrated and ready to print. Now we will select " +
                    "the demo print job (the GCODE file) for the printer. To select the print job, " +
                    "click on <i class=\"fa fa-file\"></i> <b>Select print job</b>.</div>"
                },
                {
                    //24 +
                    element: $('.browse_modes').find('.button-area:contains(\'Printer\')')[0],
                    intro: "<div class=\"step-header\">Your First Print<a class=\"exit-button\" data-bind=\"click: " +
                    "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                    "<div class=\"step-text\">Now we can select a GCODE file that's saved on the printer. " +
                    "There is a sample print you can try out.</div>"
                },
                {
                    //25 +
                    element: '#print_files',
                    intro: "<div class=\"step-header\">Your First Print<a class=\"exit-button\" data-bind=\"click: " +
                    "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                    "<div class=\"step-text\">Select the file and press on the <i class=\"fa fa-play\">" +
                    "</i> button next to it</div>"
                },
                {
                    //26 +
                    element: '#mode_select',
                    intro: "<div class=\"step-header\">Your First Print<a class=\"exit-button\" data-bind=\"click: " +
                    "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                    "<div class=\"step-text\">Select one of the print modes. When you're ready, press <b>Start Print</b> or if you don't want to print" +
                    " anything press <b>Cancel</b>.</div>",
                    position: 'bottom'
                },
                {
                    //27 +
                    intro: "<div class=\"step-header\">Your First Print<a class=\"exit-button\" data-bind=\"click: " +
                    "function () { exitButton() } \"><i class=\"fa fa-times\"></i></a></div>" +
                    "<div class=\"step-text\">Good Job!<br>The printer is now printing the first print. " +
                    "Watch how the object magically appears before you.<br>" +
                    "<div class=\"introjs-tooltipbuttons\"><a id=\"doneButton\" role=\"button\" class=\"introjs-button\"" +
                    "data-bind=\"click: function(){ doneButton() }\">Done</a></div></div>"
                }
            ];

        //IntroJS Callback Functions
        self.introInstance.onbeforechange(function() {
            switch (self.currentStep()){
                case 1: self.introInstance.refresh();
                        $('#print_icon').mousedown();
                        self.isFirstStep = true;
                    break;
                case 11: self.introInstance.refresh();
                         $('#settings_icon').mousedown();
                    break;
                case 23: self.introInstance.refresh();
                         $('#print_icon').mousedown();
                    break;
            }
        });

        self.introInstance.onafterchange(function () {
            var element = document.getElementById('introjs-container');
            ko.cleanNode(element);
            setTimeout(function () {
                ko.applyBindings(self, element);
            }, 750);
            switch (self.currentStep()){
                case 17: setTimeout(function (){$('.introjs-tooltip').css({top:'204px'});
                                                $('.introjs-helperLayer').css({height:'194px'})}, 750);
                    break;
                case 20: setTimeout(function (){$('.introjs-tooltip').css({top:'204px'});
                                                $('.introjs-helperLayer').css({height:'194px'})}, 750);
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
                        scrollToElement: false,
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
        };

        self.beginButton = function () {
            //Check if filament is loaded and skips steps when not needed.
            if(self.currentStep() == 1){
                sendToApi('printer/had_first_start');
                self.isFirstStep = false;
            }
            if(self.toolInfo.getToolByKey('tool0').filament.materialProfileName() != 'None' && self.toolInfo.getToolByKey('tool1').filament.materialProfileName() != 'None'){
                self.introInstance.goToStep(10);
            }
            else if (self.toolInfo.getToolByKey('tool1').filament.materialProfileName() != 'None' && self.toolInfo.getToolByKey('tool0').filament.materialProfileName() == 'None'){
                self.introInstance.goToStep(6);
            }
            else {
                self.introInstance.goToStep(2);
            }
        };

        self.cancelButton = function () {
            //Cancels the intro, sends to backend that intro has run.
            if(self.currentStep() == 1 && self.isFirstStep == true){
                sendToApi('printer/had_first_start');
                self.isFirstStep = false;
            }
            self.isTutorialStarted = false;
            self.introInstance.exit();
        };

        self.doneButton = function () {
            //Stops intro and resets flag
            self.isTutorialStarted = false;
            self.introInstance.exit();
        };

        self.exitButton = function () {
            var step = self.currentStep();

            self.isTutorialStarted = false;

            switch (true) {
                //Extruder Calibration Exit
                case (step > 16 && step < 23):
                    callViewModels(self.allViewModels, 'onExtruderCalibrationIntroExit');
                    self.flyout.closeFlyout();
                    break;
                //Swap Filament Exit
                case (step > 2 && step < 6 || step > 6 && step < 10):
                    callViewModels(self.allViewModels, 'onFilamentIntroExit');
                    break;
                //Bed Calibration Exit
                case (step == 13 || step == 14 ):
                    callViewModels(self.allViewModels, 'onBedCalibrationIntroExit');
                    self.flyout.closeFlyout();
                    break;
                // Maintenance Flyout Exit
                case (step == 12 || step == 15):
                    self.flyout.closeFlyout();
                    $('#print_icon').mousedown();
                    break;
                // Print Flyout Exit
                case (step == 26):
                    sendToApi("printer/immediate_cancel");
                    break;
                // For other steps
                default : $('#print_icon').mousedown();
                    break;
            }
            self.introInstance.exit();
        };

        self.currentStep = function () {
            return self.introInstance._currentStep+1;
        };

        self.onAllBound = function(allViewModels) {
            self.allViewModels = allViewModels;
        };

        self.onSyncOrMirrorWarningClose = function () {
            self.introInstance.start();
            self.introInstance.goToStep(26);
        }
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
