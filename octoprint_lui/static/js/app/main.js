$(function() {

    OctoPrint = window.OctoPrint;

    //~~ Lodash setup

    _.mixin({"sprintf": sprintf, "vsprintf": vsprintf});

    //~~ Logging setup

    log.setLevel(CONFIG_DEBUG ? "debug" : "info");

    //~~ OctoPrint client setup
    OctoPrint.options.baseurl = BASEURL;
    OctoPrint.options.apikey = UI_API_KEY;

    OctoPrint.socket.onMessage("connected", function(data) {
        var payload = data.data;
        OctoPrint.options.apikey = payload.apikey;

        // update the API key directly in jquery's ajax options too,
        // to ensure the fileupload plugin and any plugins still using
        // $.ajax directly still work fine too
        UI_API_KEY = payload["apikey"];
        $.ajaxSetup({
            headers: {"X-Api-Key": UI_API_KEY}
        });
    });

    //~~ Initialize file upload plugin

    $.widget("blueimp.fileupload", $.blueimp.fileupload, {
        options: {
            dropZone: null,
            pasteZone: null
        }
    });

    //~~ Initialize i18n

    var catalog = window["BABEL_TO_LOAD_" + LOCALE];
    if (catalog === undefined) {
        catalog = {messages: undefined, plural_expr: undefined, locale: undefined, domain: undefined}
    }
    babel.Translations.load(catalog).install();

    moment.locale(LOCALE);

    // Dummy translation requests for dynamic strings supplied by the backend
    var dummyTranslations = [
        // printer states
        gettext("Offline"),
        gettext("Opening serial port"),
        gettext("Detecting serial port"),
        gettext("Detecting baudrate"),
        gettext("Connecting"),
        gettext("Operational"),
        gettext("Printing from SD"),
        gettext("Sending file to SD"),
        gettext("Printing"),
        gettext("Paused"),
        gettext("Closed"),
        gettext("Transfering file to SD")
    ];

    //~ Initialise is touch device:
    function isTouchDevice() {
        return 'ontouchstart' in document.documentElement;
    }

    //~ Set menu hover css rules for non touch devices
    if (!isTouchDevice()){
        var style_sheet = $('link[href="/plugin/lui/static/css/lui.css"]')[0].sheet
        addCSSRule(style_sheet, ".icon-bar a:hover", "color: #434A54; background-color: #FFFFFF;");
        addCSSRule(style_sheet, ".icon-bar a:hover i", "color: #434A54;");
    }


    //~~ Initialize view models

    // the view model map is our basic look up table for dependencies that may be injected into other view models
    var viewModelMap = {};

    // Fix Function#name on browsers that do not support it (IE):
    // see: http://stackoverflow.com/questions/6903762/function-name-not-supported-in-ie
    if (!(function f() {}).name) {
        Object.defineProperty(Function.prototype, 'name', {
            get: function() {
                return this.toString().match(/^\s*function\s*(\S*)\s*\(/)[1];
            }
        });
    }

    // helper to create a view model instance with injected constructor parameters from the view model map
    var _createViewModelInstance = function(viewModel, viewModelMap){
        var viewModelClass = viewModel[0];
        var viewModelParameters = viewModel[1];

        if (viewModelParameters !== undefined) {
            if (!_.isArray(viewModelParameters)) {
                viewModelParameters = [viewModelParameters];
            }

            // now we'll try to resolve all of the view model's constructor parameters via our view model map
            var constructorParameters = _.map(viewModelParameters, function(parameter){
                return viewModelMap[parameter]
            });
        } else {
            constructorParameters = [];
        }

        if (_.some(constructorParameters, function(parameter) { return parameter === undefined; })) {
            var _extractName = function(entry) { return entry[0]; };
            var _onlyUnresolved = function(entry) { return entry[1] === undefined; };
            var missingParameters = _.map(_.filter(_.zip(viewModelParameters, constructorParameters), _onlyUnresolved), _extractName);
            log.debug("Postponing", viewModel[0].name, "due to missing parameters:", missingParameters);
            return;
        }

        // if we came this far then we could resolve all constructor parameters, so let's construct that view model
        log.debug("Constructing", viewModel[0].name, "with parameters:", viewModelParameters);
        return new viewModelClass(constructorParameters);
    };

    // map any additional view model bindings we might need to make
    var additionalBindings = {};
    _.each(OCTOPRINT_ADDITIONAL_BINDINGS, function(bindings) {
        var viewModelId = bindings[0];
        var viewModelBindTargets = bindings[1];
        if (!_.isArray(viewModelBindTargets)) {
            viewModelBindTargets = [viewModelBindTargets];
        }

        if (!additionalBindings.hasOwnProperty(viewModelId)) {
            additionalBindings[viewModelId] = viewModelBindTargets;
        } else {
            additionalBindings[viewModelId] = additionalBindings[viewModelId].concat(viewModelBindTargets);
        }
    });

    // helper for translating the name of a view model class into an identifier for the view model map
    var _getViewModelId = function(viewModel){
        var name = viewModel[0].name;
        return name.substr(0, 1).toLowerCase() + name.substr(1); // FooBarViewModel => fooBarViewModel
    };

    // instantiation loop, will make multiple passes over the list of unprocessed view models until all
    // view models have been successfully instantiated with all of their dependencies or no changes can be made
    // any more which means not all view models can be instantiated due to missing dependencies
    var unprocessedViewModels = OCTOPRINT_VIEWMODELS.slice();
    unprocessedViewModels = unprocessedViewModels.concat(ADDITIONAL_VIEWMODELS);

    var allViewModels = [];
    var allViewModelData = [];
    var pass = 1;
    log.info("Starting dependency resolution...");
    while (unprocessedViewModels.length > 0) {
        log.debug("Dependency resolution, pass #" + pass);
        var startLength = unprocessedViewModels.length;
        var postponed = [];

        // now try to instantiate every one of our as of yet unprocessed view model descriptors
        while (unprocessedViewModels.length > 0){
            var viewModel = unprocessedViewModels.shift();
            var viewModelId = _getViewModelId(viewModel);

            // make sure that we don't have two view models going by the same name
            if (_.has(viewModelMap, viewModelId)) {
                log.error("Duplicate name while instantiating " + viewModelId);
                continue;
            }

            var viewModelInstance = _createViewModelInstance(viewModel, viewModelMap);

            // our view model couldn't yet be instantiated, so postpone it for a bit
            if (viewModelInstance === undefined) {
                postponed.push(viewModel);
                continue;
            }

            // we could resolve the depdendencies and the view model is not defined yet => add it, it's now fully processed
            var viewModelBindTargets = viewModel[2];
            if (!_.isArray(viewModelBindTargets)) {
                viewModelBindTargets = [viewModelBindTargets];
            }

            if (additionalBindings.hasOwnProperty(viewModelId)) {
                viewModelBindTargets = viewModelBindTargets.concat(additionalBindings[viewModelId]);
            }

            allViewModelData.push([viewModelInstance, viewModelBindTargets]);
            allViewModels.push(viewModelInstance);
            viewModelMap[viewModelId] = viewModelInstance;
        }

        // anything that's now in the postponed list has to be readded to the unprocessedViewModels
        unprocessedViewModels = unprocessedViewModels.concat(postponed);

        // if we still have the same amount of items in our list of unprocessed view models it means that we
        // couldn't instantiate any more view models over a whole iteration, which in turn mean we can't resolve the
        // dependencies of remaining ones, so log that as an error and then quit the loop
        if (unprocessedViewModels.length == startLength) {
            log.error("Could not instantiate the following view models due to unresolvable dependencies:");
            _.each(unprocessedViewModels, function(entry) {
                log.error(entry[0].name + " (missing: " + _.filter(entry[1], function(id) { return !_.has(viewModelMap, id); }).join(", ") + " )");
            });
            break;
        }

        log.debug("Dependency resolution pass #" + pass + " finished, " + unprocessedViewModels.length + " view models left to process");
        pass++;
    }
    log.info("... dependency resolution done");

    var dataUpdater = new DataUpdater(allViewModels);

    //~~ Custom knockout.js bindings


    ko.bindingHandlers.allowBindings = {
        init: function (elem, valueAccessor) {
            return { controlsDescendantBindings: !valueAccessor() };
        }
    };
    ko.virtualElements.allowedBindings.allowBindings = true;

    ko.bindingHandlers.slimScrolledForeach = {
        init: function(element, valueAccessor, allBindings, viewModel, bindingContext) {
            return ko.bindingHandlers.foreach.init(element, valueAccessor(), allBindings, viewModel, bindingContext);
        },
        update: function(element, valueAccessor, allBindings, viewModel, bindingContext) {
            setTimeout(function() {
                if (element.nodeName == "#comment") {
                    // foreach is bound to a virtual element
                    $(element.parentElement).slimScroll({scrollBy: 0});
                } else {
                    $(element).slimScroll({scrollBy: 0});
                }
            }, 10);
            return ko.bindingHandlers.foreach.update(element, valueAccessor(), allBindings, viewModel, bindingContext);
        }
    };
    ko.virtualElements.allowedBindings.slimScrolledForeach = true;

    ko.bindingHandlers.invisible = {
        init: function(element, valueAccessor, allBindings, viewModel, bindingContext) {
            if (!valueAccessor()) return;
            ko.bindingHandlers.style.update(element, function() {
                return { visibility: 'hidden' };
            });
        }
    };


    // jquery plugin to select all text in an element
    // originally from: http://stackoverflow.com/a/987376
    $.fn.selectText = function() {
        var doc = document;
        var element = this[0];
        var range, selection;

        if (doc.body.createTextRange) {
            range = document.body.createTextRange();
            range.moveToElementText(element);
            range.select();
        } else if (window.getSelection) {
            selection = window.getSelection();
            range = document.createRange();
            range.selectNodeContents(element);
            selection.removeAllRanges();
            selection.addRange(range);
        }
    };

    $.fn.isChildOf = function (element) {
        return $(element).has(this).length > 0;
    };

    // Allow components to react to tab change
    var tabs = $('#tabs a[data-toggle="tab"]');
    tabs.on('show', function (e) {
        var current = e.target.hash;
        var previous = e.relatedTarget.hash;
        callViewModels(allViewModels, "onTabChange", [current, previous]);
    });

    tabs.on('shown', function (e) {
        var current = e.target.hash;
        var previous = e.relatedTarget.hash;
        callViewModels(allViewModels, "onAfterTabChange", [current, previous]);
    });


    //~~ Starting up the app

    callViewModels(allViewModels, "onStartup");

    //~~ view model binding

    var bindViewModels = function() {
        log.info("Going to bind " + allViewModelData.length + " view models...");
        _.each(allViewModelData, function(viewModelData) {
            if (!Array.isArray(viewModelData) || viewModelData.length != 2) {
                return;
            }

            var viewModel = viewModelData[0];
            var targets = viewModelData[1];

            if (targets === undefined) {
                return;
            }

            if (!_.isArray(targets)) {
                targets = [targets];
            }

            if (viewModel.hasOwnProperty("onBeforeBinding")) {
                viewModel.onBeforeBinding();
            }

            if (targets !== undefined) {
                if (!_.isArray(targets)) {
                    targets = [targets];
                }

                viewModel._bindings = [];

                _.each(targets, function(target) {
                    if (target === undefined) {
                        return;
                    }

                    var object;
                    if (!(target instanceof jQuery)) {
                        object = $(target);
                    } else {
                        object = target;
                    }

                    if (object === undefined || !object.length) {
                        log.info("Did not bind view model", viewModel.constructor.name, "to target", target, "since it does not exist");
                        return;
                    }

                    var element = object.get(0);
                    if (element === undefined) {
                        log.info("Did not bind view model", viewModel.constructor.name, "to target", target, "since it does not exist");
                        return;
                    }

                    try {
                        ko.applyBindings(viewModel, element);
                        viewModel._bindings.push(target);

                        if (viewModel.hasOwnProperty("onBoundTo")) {
                            viewModel.onBoundTo(target, element);
                        }

                        log.debug("View model", viewModel.constructor.name, "bound to", target);
                    } catch (exc) {
                        log.error("Could not bind view model", viewModel.constructor.name, "to target", target, ":", (exc.stack || exc));
                    }
                });
            }

            viewModel._unbound = viewModel._bindings !== undefined && viewModel._bindings.length === 0;

            if (viewModel.hasOwnProperty("onAfterBinding")) {
                viewModel.onAfterBinding();
            }
        });

        callViewModels(allViewModels, "onAllBound", [allViewModels]);
        log.info("... binding done");

        callViewModels(allViewModels, "onStartupComplete");
    };

    if (!_.has(viewModelMap, "settingsViewModel")) {
        throw new Error("settingsViewModel is missing, can't run UI");
    }
    viewModelMap["settingsViewModel"].requestData()
        .done(bindViewModels);


    // Icon bar selection
    $('.icon-bar a').on('click', function() {
        //Remove open from open tab
        $('.tabs > .tab.open').removeClass('open');
        var tabID = $(this).attr('href');
        $('.icon-bar > a.active').removeClass('active');
        $(this).addClass('active');
        $(tabID).addClass('open');
    });

    // Open additional info print file
    $('li.file_name, li.file_info').on('click', function() {
        $(this).parent().siblings('.file_add_info').toggleClass('slide');
    });


    // Extruder toggle 
    $('.control-extrusion').on('click', '.not-active', function(){
        $(this).toggleClass('secondary-button active not-active');
        $(this).siblings().toggleClass('secondary-button active not-active');
    });

    // Don't drag links on touch screen
    $('a, div').on('dragstart', function(event) {event.preventDefault();});

    // Allow global click on overlay to cancel flyout

    var offline_blocking = false;
    var flyout = viewModelMap["flyoutViewModel"];
    var $overlay = $('.overlay');
    $overlay.bind("click", function(e) {
        e.preventDefault();
        if (offline_blocking) {
            return;
        }

        if (!flyout.blocking &&
            flyout.warnings().length == 0 &&
            flyout.infos().length == 0 &&
            flyout.confirmationDeferred === undefined)
        {
            flyout.closeFlyout();
        }
    });

    // notifyjs init

    $.notify.defaults( 
        {
            arrowShow: false,
            autoHideDelay: 3000,
            globalPosition: "top left",
            style: "lui",
            className: "success",
            gap: 0
        }
    );

    // Global variable to defer print event notifications, e.g. during calibration
    deferEventNotifications = false;

    // dropit
    $('.sort_menu').dropit();

    // jQuery overscroll

    if (LPFRG_MODEL == "Xeed") {    
        $(".flyout-body").overscroll({
                direction: 'vertical',
                showThumbs: false
        });

        $("#tabs").overscroll({
                direction: 'vertical',
                showThumbs: false
        });
    }

    // JQuery Virtual Keyboard init

    var keyboardLayouts = {
        qwerty: {
            display: {
                'bksp'   :  "\u2190",
                'accept' : 'Accept',
                'default': 'ABC',
                'meta1'  : '.?123',
                'meta2'  : '#+=',
                'clear'  : 'Clear'
            },
            layout: 'custom',
            customLayout: {
                'default': [
                    'q w e r t y u i o p {bksp}',
                    'a s d f g h j k l {clear}',
                    '{s} z x c v b n m , . {s}',
                    '{meta1} {space} {meta1} {accept}'
                ],
                'shift': [
                    'Q W E R T Y U I O P {bksp}',
                    'A S D F G H J K L {clear}',
                    '{s} Z X C V B N M ! ? {s}',
                    '{meta1} {space} {meta1} {accept}'
                ],
                'meta1': [
                    '1 2 3 4 5 6 7 8 9 0 {bksp}',
                    '- / : ; ( ) \u20ac & @ {clear}',
                    '{meta2} . , ? ! \' " {meta2}',
                    '{default} {space} {default} {accept}'
                ],
                'meta2': [
                    '[ ] { } # % ^ * + = {bksp}',
                    '_ \\ | ~ < > $ \u00a3 \u00a5 {clear}',
                    '{meta1} . , ? ! \' " {meta1}',
                    '{default} {space} {default} {accept}'
                ]
            }
        },
        number: {
            layout: 'custom',
            customLayout: {
                normal: [
                    '7 8 9 {clear}',
                    '4 5 6 {cancel}',
                    '1 2 3 {accept}',
                    '. 0 {sp:3.1}',
                ]
            },
            usePreview: true,
            display: {
                'accept':'Accept:Accept',
                'clear':'Clear:Clear'
            }
        }
    };

    if (IS_LOCAL) {
        $("input[type='text'], input[type='password']").keyboard(keyboardLayouts.qwerty);

        $("input[type='number']").keyboard(keyboardLayouts.number);

        $("#input-format").keyboard({
            layout: 'custom',
            customLayout: {
                normal: [
                    '7 8 9 {clear}',
                    '4 5 6 {cancel}',
                    '1 2 3 {accept}',
                    '. 0 {sp:3.1}',
                ]
            },
            usePreview: true,
            display: {
                'accept': 'Accept:Accept',
                'clear': 'Clear:Clear'
            },
            accepted: function (event, keyboard, el) {
                slider.noUiSlider.set(keyboard.$preview.val());
            }
        });

        $("#fd-input-format").keyboard({
            layout: 'custom',
            customLayout: {
                normal: [
                    '7 8 9 {clear}',
                    '4 5 6 {cancel}',
                    '1 2 3 {accept}',
                    '. 0 {sp:3.1}',
                ]
            },
            usePreview: true,
            display: {
                'accept': 'Accept:Accept',
                'clear': 'Clear:Clear'
            },
            accepted: function (event, keyboard, el) {
                fdSlider.noUiSlider.set(keyboard.$preview.val());
            }
        });

        ko.bindingHandlers.keyboardForeach = {
            init: function (element, valueAccessor, allBindings, viewModel, bindingContext) {
                return ko.bindingHandlers.foreach.init(element, valueAccessor(), allBindings, viewModel, bindingContext);
            },
            update: function (element, valueAccessor, allBindings, viewModel, bindingContext) {
                setTimeout(function () {
                    $(element.parentElement).find("input[type='number']").keyboard(keyboardLayouts.number);
                    $(element.parentElement).find("input[type='text']").keyboard(keyboardLayouts.qwerty);

                }, 10);
                return ko.bindingHandlers.foreach.update(element, valueAccessor(), allBindings, viewModel, bindingContext);
            }
        };
        ko.virtualElements.allowedBindings.keyboardForeach = true;
    }

    var slider = document.getElementById('slider');
    var fdSlider = document.getElementById('fd_slider');

    noUiSlider.create(slider, {
        start: 330,
        step: 1,
        behaviour: 'tap',
        connect: 'lower',
        range: {
            'min': 0,
            'max': 330
        },
        format: {
          to: function ( value ) {
            return value.toFixed(0);
          },
          from: function ( value ) {
            return value;
          }
        }
    });

    noUiSlider.create(fdSlider, {
        start: 330,
        step: 1,
        behaviour: 'tap',
        connect: 'lower',
        range: {
            'min': 0,
            'max': 330
        },
        format: {
            to: function (value) {
                return value.toFixed(0);
            },
            from: function (value) {
                return value;
            }
        }
    });

    var inputFormat = document.getElementById('input-format');
    var filament_percent = document.getElementById('filament_percent');
    var newFilamentAmount = document.getElementById('new_filament_amount');
    var newFilamentPercent = document.getElementById('new_filament_percent');


    var fdInputFormat = document.getElementById('fd-input-format');
    var fd_filament_percent = document.getElementById('fd_filament_percent');

    slider.noUiSlider.on('update', function( values, handle ) {
        inputFormat.value = values[handle];
        new_filament_amount.innerText = values[handle];
        percent = ((values[handle] / 330) * 100).toFixed(0);
        filament_percent.innerHTML = ((values[handle] / 330) * 100).toFixed(0) + "%";
        new_filament_percent.innerText = percent + "%";
    });

    fdSlider.noUiSlider.on('update', function (values, handle) {
        fdInputFormat.value = values[handle];
        percent = ((values[handle] / 330) * 100).toFixed(0);
        fd_filament_percent.innerHTML = ((values[handle] / 330) * 100).toFixed(0) + "%";
    });

    inputFormat.addEventListener('change', function(){
        slider.noUiSlider.set(this.value);
    });

    fdInputFormat.addEventListener('change', function () {
        fdSlider.noUiSlider.set(this.value);
    });

});
