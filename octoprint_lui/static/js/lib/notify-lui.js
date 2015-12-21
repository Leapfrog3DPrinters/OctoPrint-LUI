$.notify.addStyle("lui", {
    html:
        "<div>" +
            "<div class='image' data-notify-html='image'/>" +
            "<div class='text-wrapper'>" +
                "<div class='notify-title' data-notify-html='title'/>" +
                "<div class='notify-text' data-notify-html='text'/>" +
            "</div>" +
        "</div>",
    classes: {
        error: {
            "color": "#fafafa !important",
            "background-color": "#CC2B14",
            "border": "1px solid #FF0026"
        },
        success: {
            "background-color": "#A9CC3C",
            "border": "1px solid #4DB149"
        },
        info: {
            "color": "#fafafa !important",
            "background-color": "#4590cd",
            "border": "1px solid #1E90FF"
        },
        warning: {
            "background-color": "#EDDB53",
            "border": "1px solid #EEEE45"
        },
        black: {
            "color": "#fafafa !important",
            "background-color": "#333",
            "border": "1px solid #000"
        },
        white: {
            "background-color": "#f1f1f1",
            "border": "1px solid #ddd"
        }
    }
});