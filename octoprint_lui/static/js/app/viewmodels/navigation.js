$(function () {
    function NavigationViewModel(parameters) {
        var self = this;

        self.loginState = parameters[0];
        self.usersettings = parameters[1];
        self.flyout = parameters[2];
        self.printerState = parameters[3];
        self.settings = parameters[4];


        self.showLoginFlyout = function ()  {
            self.usersettings.show();
            self.flyout.showFlyout('login');
        }

        //TODO: Remove!
        self._sendApi = function (data) {
            url = OctoPrint.getSimpleApiUrl('lui');
            OctoPrint.postJson(url, data);
        }

        //TODO: Remove!
        self.doDebuggingAction = function ()  {
            self._sendApi({
                command: "trigger_debugging_action"
            });
        }

        self.startIntro = function () {
            var intro = introJs();
            intro.setOptions({
                steps: [
                    {
                        element: document.querySelector('#print_icon'),
                        intro: "<div class='step-header'>Guided Tour</div>" +
                        "<div class='step-text'>Click <b> <i class='fa fa-cube'></i> Print </b> for the Print Tab. " +
                        "Here you can see the progress of the print and swap filament.",
                        position: 'top'
                    },
                    {
                        element: document.querySelector('#swap_buttons'),
                        intro: "<div class='step-header'>Guided Tour</div>" +
                        "<div class='step-text'>Click the <i class='fa fa-refresh'></i> <b> Swap </b> buttons to swap the filament ",
                        position: 'bottom'
                    },
                    {
                        element: document.querySelector('#unload_filament'),
                        intro: "<div class='step-header'>Guided Tour</div>" +
                        "<div class='step-text'>Here you can unload the filament that is loaded in the machine. " +
                        "This can be done by clicking on <i class='fa fa-arrow-up'> </i><b>Unload</b>.",
                        position: 'left'
                    },
                    {
                        element: document.querySelector('#load_filament'),
                        intro: "<div class='step-header'>Guided Tour</div>" +
                        "<div class='step-text'>Choose the material you want to load and give the amount that is on the roll",
                        position: 'left'
                    },
                    {
                        element: document.querySelector('#step4'),
                        intro: "<div class='step-header'>Guided Tour</div>" +
                        "<div class='step-text'>To print out your first print, you have to give the printer a job." +
                        " To select a job, click on <i class='fa fa-file'></i> <b>Select print job</b>.</div>"
                    },
                    {
                        element: document.querySelector('#step5'),
                        intro: "<div class='step-header'>Guided Tour</div>" +
                        "<div class='step-text'>To select a print that is stored on the printer." +
                        " Click on <i class='fa fa-hdd-o'></i> <b>Printer</b>.</div>"
                    },
                    {
                        element: document.querySelector('#step6'),
                        intro: "<div class='step-header'>Guided Tour</div>" +
                        "<div class='step-text'>To select a print that is stored on the usb stick" +
                        " Click on <i class='fa fa-usb'></i> <b>USB</b>.</div>"
                    },
                    {
                        element: document.querySelector('#step7'),
                        intro: "<div class='step-header'>Guided Tour</div>" +
                        "<div class='step-text'>To upload a print." +
                        " Click on <i class='fa fa-upload' aria-hidden='true'> </i><b>Upload</b>.</div>"
                    },
                    {
                        element: document.querySelector('#step8'),
                        intro: "<div class='step-header'>Guided Tour</div>" +
                        "<div class='step-text'> Use the <b>Search</b> bar to find a certain print that is stored on the printer"
                    },
                    {
                        element: document.querySelector('#files_options'),
                        intro: "<div class='step-header'>Guided Tour</div>" +
                        "<div class='step-text'> Use the <i class='fa fa-list'></i> Menu to sort the files, delete them or see how much space is left.",
                        position: 'left'
                    },
                    {
                        element: document.querySelector('#files_icon'),
                        intro: "<div class='step-header'>Guided Tour</div>" +
                        "<div class='step-text'>Click <b> <i class='fa fa-file'></i> Jobs </b> for the Jobs Tab. " +
                        "Here you can upload files to the printer and select the file you want to print.",
                        position: 'top'
                    },
                    {
                        element: document.querySelector('#settings_icon'),
                        intro: "<div class='step-header'>Guided Tour</div>" +
                        "<div class='step-text'>Click <b> <i class='fa fa-gears'> </i> Settings </b> for the Settings Tab. " +
                        "Here you can change the settings of the printer and update the software.",
                        position: 'top'
                    }

                ],
                showStepNumbers: false,
                scrollToElement: true,
                exitOnOverLayClick: true,
                showBullets: true,
                showButtons: true
            });

            intro.onbeforechange(function(targetElement) {
                if (targetElement.id === 'load_filament') {
                    self.flyout.showFlyout('filament');
                    $('#swap-info,#fd-swap-info').removeClass('active');
                    $('#swap-load-unload,#fd-swap-load-unload').addClass('active');
                    $('.swap_process_step,.fd_swap_process_step').removeClass('active');
                    $('#load_filament,#fd_load_filament').addClass('active');
                    console.log("Load active");
                }
                if (targetElement.id === 'unload_filament') {
                    $('.swap_process_step,.fd_swap_process_step').removeClass('active');
                    $('#unload_filament,#fd_unload_filament').addClass('active');
                    $('#unload_cmd,#fd_unload_cmd').removeClass('disabled');
                    console.log("Unload active");
                }
                if (targetElement.id === 'step4') {
                    self.flyout.closeFlyout('filament');
                    console.log("Unload & Load deactive");
                }
                if (targetElement.id === 'step5') {
                    $("#job_button").click();
                    console.log("Job Button clicked");
                }
                if (targetElement.id === 'step4') {
                    $("#print_icon").click();
                    console.log("Print Icon clicked");
                }
                if (targetElement.id === 'files_menu') {
                    $("#files_options").click();
                    console.log("File Menu clicked");
                }
            });

            intro.start();
        };

        self.onStartup = function()
        {
            $('.network-status a').click(function ()  { self.settings.showSettingsTopic('wireless') });
        }

    }

    OCTOPRINT_VIEWMODELS.push([
        NavigationViewModel,
        ["loginStateViewModel", "userSettingsViewModel", "flyoutViewModel", "printerStateViewModel", "settingsViewModel"],
        ["#header"]
    ]);
});
