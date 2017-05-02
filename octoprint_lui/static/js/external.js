/* 
 * This script provides on screen keyboard functionality for external sites (other than localhost) 
 * Useful for showing the keyboard during OAuth authentication. Requires a browser plugin to be ran on other domains.
 * 
 * Author: Erik Heidstra <ErikHeidstra@live.nl>
 */

var keyboardScriptUrl = "//localhost/plugin/lui/static/js/lib/jquery/jquery.keyboard-1.26.14.min.js";
var jqueryScriptUrl = "//localhost/plugin/lui/static/js/lib/jquery/jquery-3.1.1.min.js";

var extCss = [
    "//localhost/plugin/lui/static/css/keyboard-lui.css"
];

var body = document.getElementsByTagName('body')[0];

function loadScript(scriptUrl, onLoaded)
{
    var scriptElem = document.createElement("script");
    scriptElem.setAttribute("src", scriptUrl);
    scriptElem.onload = onLoaded;
    body.appendChild(scriptElem);   
}

function onKeyboardLoaded() {


    var keyboardLayouts = {
        qwerty: {
            display: {
                'bksp': "\u2190",
                'accept': 'Accept',
                'default': 'ABC',
                'meta1': '.?123',
                'meta2': '#+=',
                'clear': 'Clear'
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
                'accept': 'Accept:Accept',
                'clear': 'Clear:Clear'
            }
        }
    };

    $("input[type='text'], input[type='password'], input[type='email']").keyboard(keyboardLayouts.qwerty);


    // Listen for any future changes
    MutationObserver = window.MutationObserver || window.WebKitMutationObserver;

    var observer = new MutationObserver(function (mutations, observer) {
        $("input[type='text'], input[type='password'], input[type='email']").keyboard(keyboardLayouts.qwerty);
    });

    observer.observe(document, {
        subtree: true,
        attributes: true
    });
}

function onJqueryLoaded() {
    loadScript(keyboardScriptUrl, onKeyboardLoaded);
}


// Begin loading scripts
if (typeof ($) == "undefined") {
    if (typeof (jQuery) == "undefined") {
        // We really don't have jQuery, load it
        loadScript(jqueryScriptUrl, onJqueryLoaded);
    }
    else {
        // jQuery was hidden. Map it to $ (as the keyboard plugin uses that syntax)
        $ = jQuery;
        onJqueryLoaded();
    }
}
else {
    // jQuery was loaded already
    onJqueryLoaded();
}

for (j in extCss) {
    var cssElem = document.createElement("link");
    cssElem.setAttribute("href", extCss[j]);
    cssElem.setAttribute("rel", "stylesheet");
    body.appendChild(cssElem);
}
