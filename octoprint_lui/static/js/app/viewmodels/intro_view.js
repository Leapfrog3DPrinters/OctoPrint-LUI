$(function ()  {
    function IntroViewModel(parameters) {
        var self = this;

        self.firstRun = true;

        self.viewmodel = undefined;
        self.flyout = parameters[0];

        self.introInstance = introJs();
        self.introInstance.setOptions({
            steps: [
                {
                    element: document.querySelector('#swap_button'),
                    intro: "<div class='step-header'>Getting Started</div>" +
                    "<div class='step-text'>Welcome to your new printer. In order to print stuff, we first have to " +
                    "load some filament in the printer. Click <i class='fa fa-refresh'></i> <b> Swap Right</b> " +
                    "to load the filament in the right and main extruder.</div>",
                    position: 'top'
                },
                {
                    element: document.querySelector('#load_filament'),
                    intro: "<div class='step-header'>Getting Started</div>" +
                    "<div class='step-text'>Choose what kind of material you are loading and give the amount " +
                    "that you are loading. This way the printer knows what it's using.</div>",
                    position: 'bottom',
                    tooltipClass: "tooltip_hidden"
                },
                {
                    element: document.querySelector('#abort_filament'),
                    intro: "<div class='step-header'>Getting Started</div>" +
                    "<div class='step-text'>The filament is being loaded. When something goes wrong you can press " +
                    "Abort to cancel the action.</div>",
                    position: 'top'
                },
                {
                    element: document.querySelector('#finished_filament'),
                    intro: "<div class='step-header'>Getting Started</div>" +
                    "<div class='step-text'>We are now done loading the filament. If your not satisfied with the " +
                    "amount that came out of the nozzle you can press <b>Extrude More</b>. If you are ready for " +
                    "the next step press <b>Done</b>.</div>"
                },
                {
                    element: document.querySelector('#job_button'),
                    intro: "<div class='step-header'>Getting Started</div>" +
                    "<div class='step-text'>Now we can select our print job for the printer. To" +
                    " select a print job, click on <i class='fa fa-file'></i> <b>Select print job</b>.</div>"
                },
                {
                    element: document.querySelector('#local_button'),
                    intro: "<div class='step-header'>Getting Started</div>" +
                    "<div class='step-text'>Now we can select a GCODE file that's saved on the printer. " +
                    "There is a sample print you can try out.</div>"
                },
                {
                    element: document.querySelector("#print_files .file_entry:nth-of-type(2)"),
                    intro: "<div class='step-header'>Getting Started</div>" +
                    "<div class='step-text'>Select the file and press on the <i class='fa fa-play'>" +
                    "</i> button next to it</div>"
                },
                {
                    element: document.querySelector('#start_print'),
                    intro: "<div class='step-header'>Getting Started</div>" +
                    "<b class='step-text'>For the first print we will keep it simple and print in normal" +
                    " mode. So when you're ready, press <b>Start Print</b> or if you don't want to print" +
                    " anything press <b>Cancel</b>.</div>",
                    position: 'top'
                }
            ],
            showStepNumbers: false,
            scrollToElement: true,
            exitOnOverLayClick: false,
            showBullets: true,
            showButtons: false,
            keyboardNavigation: false

        });

        self.introInstance.onbeforechange(function(targetElement) {
            switch(targetElement.id) {
                case 'swap_button':
                    $('#print_icon').click();
                    console.log('beforeswap');
                    break;
                case 'load_filament':
                    console.log('beforeload');
                    break;
                case 'finished_filament':
                    console.log('beforefinished');
                    break;
                case 'job_button':
                    $('#print_icon').click();
                    console.log('beforejob');
                    break;
                case 'local_button':
                    console.log('beforelocal');
                    break;
                case 'usb_button':
                    console.log('beforeusb');
                    break;
                case 'upload_button':
                    console.log('beforeupload');
                    break;
            }
        });

        self.introInstance.onafterchange(function(targetElement) {
            switch (targetElement.id){
                case 'swap_button':
                    console.log('afterswap');
                    break;
                case 'load_filament':
                    console.log('afterload');
                    break;
                case 'finished_filament':
                    console.log('afterfinished');
                    break;
                case 'job_button':
                    console.log('afterjob');
                    break;
                case 'local_button':
                    console.log('afterlocal');
                    break;
                case 'usb_button':
                    console.log('afterusb');
                    break;
                case 'upload_button':
                    console.log('afterupload');
                    break;
            }
        });

        self.introInstance.onchange(function(targetElement){
            switch (targetElement.id){
                case 'swap_button':
                    console.log('onswap');
                    break;
                case 'load_filament':
                    console.log('onload');
                    break;
                case 'finished_filament':
                    console.log('onfinished');
                    break;
                case 'job_button':
                    console.log('onjob');
                    break;
                case 'local_button':
                    console.log('onlocal');
                    break;
                case 'usb_button':
                    console.log('onusb');
                    break;
                case 'upload_button':
                    console.log('onupload');
                    break;
            }
        });

        self.introInstance.oncomplete(function(){
            $('overlay').removeClass('active');
            $('introjs-overlay').remove();
            self.firstRun = false;
        });

        self.introInstance.onexit(function () {
            $('overlay').removeClass('active');
            $('introjs-overlay').remove();
            self.firstRun = false;
        });

        self.startIntro = function () {
            self.introInstance.start();
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
