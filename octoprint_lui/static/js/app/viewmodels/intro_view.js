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
                    intro: "<div class=\"step-header\">Getting Started</div>" +
                    "<div class=\"step-text\"><b>Welcome to your new Bolt.</b><br>This tutorial will guide you through the" +
                    " steps you have to take to start printing your creations.<br>" +
                    "<div class=\"introjs-tooltipbuttons\"><a id=\"nextButton\" role=\"button\"" +
                    "class=\"introjs-button\" data-bind=\"click: function (){ nextButton(2) }\">Begin</a>" +
                    "<a id=\"cancelButton\" role=\"button\" class=\"introjs-button\"" +
                    "data-bind=\"click: function (){ doneButton() }\">Cancel</a></div></div>"
                },
                {
                    //2
                    element: 'none',
                    intro: "<div class=\"step-header\">Getting Started</div>" +
                    "<div class=\"step-text\">Before we start printing, we have to be sure that the bed is level and" +
                    " that the extruder is aligned</div><div class=\"introjs-tooltipbuttons\"><a id=\"nextButton\" role=\"button\"" +
                    "class=\"introjs-button\" data-bind=\"click: function (){ nextButton(3) }\">Next</a></div></div>"
                },
                {
                    //3
                    element: document.querySelector('#maintenance'),
                    intro: "<div class=\"step-header\">Getting Started</div>" +
                    "<div class=\"step-text\">To get to the maintenance menu, click here</div>",
                    position: 'bottom'
                },
                {
                    //4
                    element: document.querySelector('#bed_calibrate'),
                    intro: "<div class=\"step-header\">Getting Started</div>" +
                    "<div class=\"step-text\">To calibrate the bed, click here</div>",
                    position: 'top'
                },
                {
                    //5
                    element: document.querySelector('#continue_calibration'),
                    intro: "<div class=\"step-header\">Getting Started</div>" +
                    "<div class=\"step-text\">To calibrate the bed, click here</div>",
                    position: 'top'
                },
                {
                    //6
                    element: document.querySelector('#bed_calibration'),
                    intro: "<div class=\"step-header\">Getting Started</div>" +
                    "<div class=\"step-text\">To calibrate the bed, click here" +
                    "<a id=\"nextButton\" role=\"button\" class=\"introjs-button\" " +
                    "data-bind=\"click: function (){nextButton(7)}\">Done</a></div>",
                    position: 'bottom'
                },
                {
                    //7
                    element: document.querySelector('#swap_button'),
                    intro: "<div class=\"step-header\">Getting Started</div>" +
                    "<div class=\"step-text\">In order to print stuff, we first have to " +
                    "load some filament in the printer. Click <i class=\"fa fa-refresh\"></i> <b> Swap Right</b> " +
                    "to load the filament in the right and main extruder.</div>",
                    position: 'top'
                },
                {
                    //8
                    element: document.querySelector('#load_filament'),
                    intro: "<div class=\"step-header\">Getting Started</div>" +
                    "<div class=\"step-text\">Choose what kind of material you are loading and give the amount " +
                    "that you are loading. This way the printer knows what it's using.</div>",
                    position: 'bottom',
                    tooltipClass: "tooltip_hidden"
                },
                {
                    //9
                    element: document.querySelector('#filament_loading'),
                    intro: "<div class=\"step-header\">Getting Started</div>" +
                    "<div class=\"step-text\">The filament is being loaded. When something goes wrong you can press " +
                    "Abort to cancel the action.</div>",
                    position: 'bottom'
                },
                {
                    //10
                    element: document.querySelector('#finished_filament'),
                    intro: "<div class=\"step-header\">Getting Started</div>" +
                    "<div class=\"step-text\">We are now done loading the filament. If your not satisfied with the " +
                    "amount that came out of the nozzle you can press <b>Extrude More</b>. If you are ready for " +
                    "the next step press <b>Done</b>.</div>"
                },
                {
                    //11
                    element: document.querySelector('#job_button'),
                    intro: "<div class=\"step-header\">Getting Started</div>" +
                    "<div class=\"step-text\">Now we can select our print job for the printer. To" +
                    " select a print job, click on <i class=\"fa fa-file\"></i> <b>Select print job</b>.</div>"
                },
                {
                    //12
                    element: document.querySelector('#local_button'),
                    intro: "<div class=\"step-header\">Getting Started</div>" +
                    "<div class=\"step-text\">Now we can select a GCODE file that's saved on the printer. " +
                    "There is a sample print you can try out.</div>"
                },
                {
                    //13
                    element: document.querySelector("#print_files"),
                    intro: "<div class=\"step-header\">Getting Started</div>" +
                    "<div class=\"step-text\">Select the file and press on the <i class=\"fa fa-play\">" +
                    "</i> button next to it</div>"
                },
                {
                    //14
                    element: document.querySelector('#start_print'),
                    intro: "<div class=\"step-header\">Getting Started</div>" +
                    "<div class=\"step-text\">For the first print we will keep it simple and print in normal" +
                    " mode. So when you're ready, press <b>Start Print</b> or if you don't want to print" +
                    " anything press <b>Cancel</b>.</div>",
                    position: 'top'
                },
                {
                    //15
                    element: 'none',
                    intro: "<div class=\"step-header\">Getting Started</div>" +
                    "<div class=\"step-text\">Good Job!<br>The printer is now printing the first print. " +
                    "Watch how the object magically appears before you.<br>" +
                    "<div class=\"introjs-tooltipbuttons\"><a id=\"doneButton\" role=\"button\" class=\"introjs-button\"" +
                    "data-bind=\"click: function(){ doneButton() }\">Done</a></div></div>"
                }
            ],
            showStepNumbers: false,
            scrollToElement: true,
            exitOnOverLayClick: false,
            showBullets: true,
            showButtons: false,
            keyboardNavigation: true

        });

        self.introInstance.onbeforechange(function(targetElement) {
            switch(targetElement.id) {
                case 'swap_button':
                    $('#print_icon').click();
                    console.log('beforeswap');
                    break;
                case 'job_button':
                    $('#print_icon').click();
                    console.log('beforejob');
                    break;
                case 'maintenance':
                    $('#settings_icon').click();
            }
        });

        self.introInstance.onafterchange(function (targetElement) {
            var element = document.getElementById('introjs-container');
            ko.cleanNode(element);
            ko.applyBindings(self, element);
        });

        self.introInstance.oncomplete(function(){
            self.firstRun = false;
            console.log('oncomplete');
        });

        self.introInstance.onexit(function () {
            self.firstRun = false;
            console.log('onexit');
        });

        self.startIntro = function () {
            self.firstRun = true;
            self.introInstance.start();
        }

        self.nextButton = function (step) {
            self.introInstance.goToStep(step);
        }

        self.doneButton = function () {
            self.introInstance.exit();
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
        [ "flyoutViewModel"],

        // Finally, this is the list of all elements we want this view model to be bound to.
        ["#intro_button"]
    ]);
});
