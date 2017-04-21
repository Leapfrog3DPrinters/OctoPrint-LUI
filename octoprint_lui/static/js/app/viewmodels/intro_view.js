$(function ()  {
    function IntroViewModel(parameters) {
        var self = this;

        self.firstRun = false;

        self.viewmodel = undefined;
        self.flyout = parameters[0];

        self.introInstance = introJs();
        self.introInstance.setOptions({
            steps: [
                {
                    //1
                    element: 'none',
                    intro: "<div class=\"step-header\">Your First Print</div>" +
                    "<div class=\"step-text\"><b>Welcome to your new Bolt.</b><br>This tutorial will guide you through the" +
                    " steps you have to take to start printing your creations.<br>" +
                    "<div class=\"introjs-tooltipbuttons\"><a id=\"nextButton\" role=\"button\"" +
                    "class=\"introjs-button\" data-bind=\"click: function (){ goToStepButton(2) }\">Begin</a>" +
                    "<a id=\"cancelButton\" role=\"button\" class=\"introjs-button\"" +
                    "data-bind=\"click: function (){ doneButton() }\">Cancel</a></div></div>"
                },
                {
                    //2
                    element: document.querySelector('#swap-left'),
                    intro: "<div class=\"step-header\">Your First Print</div>" +
                    "<div class=\"step-text\">In order to print stuff, we first have to " +
                    "load some filament in the printer. Click <i class=\"fa fa-refresh\"></i> <b> Swap Left</b> " +
                    "to load the filament in the left and main extruder.</div>",
                    position: 'top'
                },
                {
                    //3
                    element: document.querySelector('#load_filament'),
                    intro: "<div class=\"step-header\">Your First Print</div>" +
                    "<div class=\"step-text\">Choose what kind of material you are loading and give the amount " +
                    "that you are loading. This way the printer knows what it's using.</div>",
                    position: 'bottom',
                    tooltipClass: "tooltip_hidden"
                },
                {
                    //4
                    element: document.querySelector('#filament_loading'),
                    intro: "<div class=\"step-header\">Your First Print</div>" +
                    "<div class=\"step-text\">The left extruder is now being loaded. When something goes wrong you can press " +
                    "Abort to cancel the action.</div>",
                    position: 'bottom'
                },
                {
                    //5
                    element: document.querySelector('#finished_filament'),
                    intro: "<div class=\"step-header\">Your First Print</div>" +
                    "<div class=\"step-text\">We are now done loading the left filament. If your not satisfied with the " +
                    "amount that came out of the nozzle you can press <b>Extrude More</b>. If you are ready for " +
                    "the next step press <b>Done</b>.</div>"
                },
                {
                    //6
                    element: document.querySelector('#swap-right'),
                    intro: "<div class=\"step-header\">Your First Print</div>" +
                    "<div class=\"step-text\">In order to print stuff, we first have to " +
                    "load some filament in the printer. Click <i class=\"fa fa-refresh\"></i> <b> Swap Right</b> " +
                    "to load the filament in the right and main extruder.</div>",
                    position: 'top'
                },
                {
                    //7
                    element: document.querySelector('#load_filament'),
                    intro: "<div class=\"step-header\">Your First Print</div>" +
                    "<div class=\"step-text\">Choose what kind of material you are loading and give the amount " +
                    "that you are loading. This way the printer knows what kind of filament you want to load.</div>",
                    position: 'bottom',
                    tooltipClass: "tooltip_hidden"
                },
                {
                    //8
                    element: document.querySelector('#filament_loading'),
                    intro: "<div class=\"step-header\">Your First Print</div>" +
                    "<div class=\"step-text\">The right extruder is being loaded. When something goes wrong you can press " +
                    "Abort to cancel the action.</div>",
                    position: 'bottom'
                },
                {
                    //9
                    element: document.querySelector('#finished_filament'),
                    intro: "<div class=\"step-header\">Your First Print</div>" +
                    "<div class=\"step-text\">We are now done loading the right filament. If your not satisfied with the " +
                    "amount that came out of the nozzle you can press <b>Extrude More</b>. If you are ready for " +
                    "the next step press <b>Done</b>.</div>"
                },
                {
                    //10
                    element: 'none',
                    intro: "<div class=\"step-header\">Your First Print</div>" +
                    "<div class=\"step-text\">Now that we have loaded the filament we have to calibrate the printer to make sure that the bed and" +
                    " the extruders are aligned</div><div class=\"introjs-tooltipbuttons\"><a id=\"nextButton\" role=\"button\"" +
                    "class=\"introjs-button\" data-bind=\"click: function (){ goToStepButton(11) }\">Next</a></div></div>"
                },
                {
                    //11
                    element: document.querySelector('#maintenance'),
                    intro: "<div class=\"step-header\">Your First Print</div>" +
                    "<div class=\"step-text\">To get to the maintenance menu, click on <i class=\"fa fa-wrench\"></i><b> Maintenance</b>.</div>",
                    position: 'bottom'
                },
                {
                    //12
                    element: document.querySelector('#bed_calibrate'),
                    intro: "<div class=\"step-header\">Your First Print</div>" +
                    "<div class=\"step-text\">To calibrate the bed, click on <b>Calibrate bed</b>.</div>",
                    position: 'top'
                },
                {
                    //13
                    element: document.querySelector('#continue_calibration'),
                    intro: "<div class=\"step-header\">Your First Print</div>" +
                    "<div class=\"step-text\">Check if the printbed is empty, when it is click on <b>Continue calibration</b>.</div>",
                    position: 'top'
                },
                {
                    //14
                    element: document.querySelector('#bed_calibration'),
                    intro: "<div class=\"step-header\">Your First Print</div>" +
                    "<div class=\"step-text\">When you have calibrated the bed, press <b>Close</b>.</div>",
                    position: 'top',
                    tooltipClass: 'tooltip_hidden'
                },
                {
                    //15
                    element: document.querySelector('#extruder_calibrate'),
                    intro: "<div class=\"step-header\">Your First Print</div>" +
                    "<div class=\"step-text\">To align the extruders, press <b>Calibrate extruders</b>.</div>",
                    position: 'bottom'
                },
                {
                    //16
                    element: document.querySelector('#start-large-extruder-calibration'),
                    intro: "<div class=\"step-header\">Your First Print</div>" +
                    "<div class=\"step-text\">To the extruder calibration, press <b>Start calibration</b>.</div>",
                    position: 'bottom'
                },
                {
                    //17
                    element: document.querySelector('#printing-extruder-calibration'),
                    intro: "<div class=\"step-header\">Your First Print</div>" +
                    "<div class=\"step-text\">Printing large calibration.</div>",
                    position: 'bottom'
                },
                {
                    //18
                    element: document.querySelector('#large-calibration'),
                    intro: "<div class=\"step-header\">Your First Print</div>" +
                    "<div class=\"step-text\">Select the best aligned line, press Next</div>",
                    position: 'bottom'
                },
                {
                    //19
                    element: document.querySelector('#start-small-extruder-calibration'),
                    intro: "<div class=\"step-header\">Your First Print</div>" +
                    "<div class=\"step-text\">Start small calibration</div>",
                    position: 'bottom'
                },
                {
                    //20
                    element: document.querySelector('#printing-extruder-calibration'),
                    intro: "<div class=\"step-header\">Your First Print</div>" +
                    "<div class=\"step-text\">Printing small calibration</div>",
                    position: 'bottom'
                },
                {
                    //21
                    element: document.querySelector('#x-small-calibration'),
                    intro: "<div class=\"step-header\">Your First Print</div>" +
                    "<div class=\"step-text\">Select the best aligned line x, press Next</div>",
                    position: 'bottom'
                },
                {
                    //22
                    element: document.querySelector('#y-small-calibration'),
                    intro: "<div class=\"step-header\">Your First Print</div>" +
                    "<div class=\"step-text\">Select the best aligned line y, press Next</div>",
                    position: 'bottom'
                },
                {
                    //23
                    element: document.querySelector('#job_button'),
                    intro: "<div class=\"step-header\">Your First Print</div>" +
                    "<div class=\"step-text\">Good Job, The printer is now calibrated and ready to print. Now we will select " +
                    "the demo print job (the GCODE file) for the printer. To select the print job, " +
                    "click on <i class=\"fa fa-file\"></i> <b>Select print job</b>.</div>"
                },
                {
                    //24
                    element: document.querySelector('#local_button'),
                    intro: "<div class=\"step-header\">Your First Print</div>" +
                    "<div class=\"step-text\">Now we can select a GCODE file that's saved on the printer. " +
                    "There is a sample print you can try out.</div>"
                },
                {
                    //25
                    element: document.querySelector("#print_files"),
                    intro: "<div class=\"step-header\">Your First Print</div>" +
                    "<div class=\"step-text\">Select the file and press on the <i class=\"fa fa-play\">" +
                    "</i> button next to it</div>"
                },
                {
                    //26
                    element: document.querySelector('#start_print'),
                    intro: "<div class=\"step-header\">Your First Print</div>" +
                    "<div class=\"step-text\">For the first print we will keep it simple and print in normal" +
                    " mode. So when you're ready, press <b>Start Print</b> or if you don't want to print" +
                    " anything press <b>Cancel</b>.</div>",
                    position: 'top'
                },
                {
                    //27
                    element: 'none',
                    intro: "<div class=\"step-header\">Your First Print</div>" +
                    "<div class=\"step-text\">Good Job!<br>The printer is now printing the first print. " +
                    "Watch how the object magically appears before you.<br>" +
                    "<div class=\"introjs-tooltipbuttons\"><a id=\"doneButton\" role=\"button\" class=\"introjs-button\"" +
                    "data-bind=\"click: function(){ doneButton() }\">Done</a></div></div>"
                }
            ],
            showStepNumbers: false,
            showProgress: true,
            scrollToElement: false,
            exitOnOverLayClick: false,
            showBullets: false,
            showButtons: false,
            keyboardNavigation: true

        });

        //IntroJS Callback Functions
        self.introInstance.onbeforechange(function() {
            switch (self.currentStep()){
                case 1: self.introInstance.refresh(); $('#print_icon').click();
                    break;
                case 11: self.introInstance.refresh(); $('#settings_icon').click();
                    break;
                case 23: self.introInstance.refresh(); $('#print_icon').click();
                    break;
            }
        });

        self.introInstance.onafterchange(function () {
            if(self.currentStep() == 1 || self.currentStep() == 10 || self.currentStep() == 27) {
                var element = document.getElementById('introjs-container');
                ko.cleanNode(element);
                setTimeout(function () {
                    ko.applyBindings(self, element);
                }, 750);
            }
        });

        self.introInstance.oncomplete(function(targetElement){
            self.firstRun = false;
            console.log('oncomplete: ' + self.firstRun);
        });

        self.introInstance.onexit(function (targetElement) {
            console.log('onexit: ' + self.firstRun);
        });

        //Own functions
        self.startIntro = function (introName) {
            self.firstRun = true;
            switch (introName){
                case "firstPrint": self.introInstance.start();
                    break;
            }
        };

        self.goToStepButton = function (step) {
            self.introInstance.goToStep(step);
        };

        self.doneButton = function () {
            self.firstRun = false;
            self.introInstance.exit();
        };

        self.currentStep = function () {
            return self.introInstance._currentStep+1;
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
        [ "flyoutViewModel" ],

        // Finally, this is the list of all elements we want this view model to be bound to.
        []
    ]);
});
