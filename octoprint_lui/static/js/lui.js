$(function() {

	$('.tool1.circle').circleProgress({
    value: 0.75,
    fill: { gradient: ['#A9CC3C', '#EDDB53', '#CC2B14'] },
    thickness: 20,
    size: 130,
    startAngle: Math.PI*(3/4)
	}).on('circle-animation-progress', function(event, progress, stepValue) {
    	$(this).find('strong').text(String(stepValue.toFixed(2)).substr(2)*4 + " C°");
	});

	$('.tool2.circle').circleProgress({
    value: 0.2,
    fill: { gradient: ['#A9CC3C', '#EDDB53', '#CC2B14'] },
    thickness: 20,
    size: 130,
    startAngle: Math.PI*(3/4)
	}).on('circle-animation-progress', function(event, progress, stepValue) {
    	$(this).find('strong').text(String(stepValue.toFixed(2)).substr(2)*4 + " C°");
	});

	$('.chamber.circle').circleProgress({
    value: 0.3,
    fill: { gradient: ['#A9CC3C', '#EDDB53', '#CC2B14'] },
    thickness: 20,
    size: 130,
    startAngle: Math.PI*(3/4)
	}).on('circle-animation-progress', function(event, progress, stepValue) {
    	$(this).find('strong').text(String(stepValue.toFixed(2)).substr(2) + " C°");
	});


    // Icon bar selection
    $('.icon-bar a').on('click', function() {
        //Remove open from open tab
        $('.tabs > .tab.open').removeClass('open');
        var tabID = $(this).attr('href');
        $('.icon-bar > a.active').removeClass('active');
        $(this).addClass('active');
        console.log(tabID);
        $(tabID).addClass('open');
        $('.app-header h3').text(tabID);

    });

    // Open additional info print file
    $('li.file_name, li.file_info').on('click', function() {
        $(this).parent().siblings('.file_add_info').toggleClass('slide');
        $(this).siblings('.file_info').children().children('.fa').toggleClass('fa-angle-down fa-angle-up');
        $(this).children().children('.fa').toggleClass('fa-angle-down fa-angle-up');
    });


    // Extruder toggle 
    $('.control-extrusion').on('click', '.not-active', function(){
        $(this).toggleClass('secondary-button active not-active');
        $(this).siblings().toggleClass('secondary-button active not-active');
    });

    // Don't drag links on touch screen
    $('a').on('dragstart', function(event) {event.preventDefault();});

    // Fly over JS  asd
    var $flyout = $('.flyout'),
    $overlay = $('.overlay'),
    $flyoutToggle = $('.flyout-toggle');
    
    $flyoutToggle.bind("click keypress", function(e) {
      e.preventDefault();
      $flyout.toggleClass('active');
      $overlay.toggleClass('active');
    });
     
    $overlay.bind("click keypress", function(e) {
    e.preventDefault();
      $flyout.toggleClass('active');
      $overlay.toggleClass('active');
    });

});
//
