/*************************************************
 * Copyright (c) 2016 Ansible, Inc.
 *
 * All Rights Reserved
 *************************************************/

$(function() {

  // Add syntax highlighting to examples in description.
  $('.description pre').addClass('prettyprint');
  prettyPrint();

  // Make links from relative URLs to resources. The value is any string a
  // user saved (a description, a name), so the link is built from it as
  // text and an attribute, never as markup, and only an /api/ path is one.
  $('span.str').each(function() {
    var m = $(this).text().match(/^"(\/api\/[^"]*)"$/);
    if (m && (m[1].match(/^\/.+\/$/) || m[1].match(/^\/.+\/\?.*$/))) {
      $(this).empty().append('"', $('<a>').attr('href', m[1]).text(m[1]), '"');
    }
  });

  // Make links for all inventory script hosts.
  $('.request-info .pln').filter(function() {
    return $(this).text() === 'script';
  }).each(function() {
    $('.response-info span.str').filter(function() {
      return $(this).text() === '"hosts"';
    }).each(function() {
      $(this).nextUntil('span.pun:contains("]")').filter('span.str').each(function() {
        // Host names are anyone's text: a link built from them as text.
        if ($(this).text().match(/^\".+\"$/)) {
          var s = $(this).text().replaceAll('"', '');
          $(this).empty().append('"', $('<a>').attr('href', '?host=' + encodeURIComponent(s)).text(s), '"');
        }
        else if ($(this).text() !== '"') {
          var s = $(this).text();
          $(this).empty().append($('<a>').attr('href', '?host=' + encodeURIComponent(s)).text(s));
        }
      });
    });
  });

  // Add classes/icons for dynamically showing/hiding help.
  if ($('.description').html()) {
    $('.description').addClass('prettyprint').parent().css('float', 'none');
    $('.hidden a.hide-description').prependTo('.description');
    $('a.hide-description').click(function() {
      $(this).tooltip('hide');
      $('.description').slideUp('fast');
      return false;
    });
    $('.hidden a.toggle-description').appendTo('.page-header h1');
    $('a.toggle-description').click(function() {
      $(this).tooltip('hide');
      $('.description').slideToggle('fast');
      return false;
    });
  }

  $('[data-toggle="tooltip"]').tooltip();

  if ($(window).scrollTop() >= 115) {
    $('body').addClass('show-title');
  }
  $(window).scroll(function() {
    if ($(window).scrollTop() >= 115) {
      $('body').addClass('show-title');
    }
    else {
      $('body').removeClass('show-title');
    }
  });

  function setCookie(name, value, path) {
    document.cookie = `${name}=${value}; path=${path}; SameSite=Lax` + (location.protocol === 'https:' ? '; Secure' : '');
  }

  $('a.resize').click(function() {
    $(this).tooltip('hide');
    if ($(this).find('span.glyphicon-resize-full').length) {
      $(this).find('span.glyphicon').addClass('glyphicon-resize-small').removeClass('glyphicon-resize-full');
      $('.container').addClass('container-fluid').removeClass('container');
      setCookie('api_width', 'wide', '/api/');
    }
    else {
      $(this).find('span.glyphicon').addClass('glyphicon-resize-full').removeClass('glyphicon-resize-small');
      $('.container-fluid').addClass('container').removeClass('container-fluid');
      setCookie('api_width', 'fixed', '/api/');
    }
    return false;
  });

  function getCookie(name) {
    var value = "; " + document.cookie;
    var parts = value.split("; " + name + "=");
    if (parts.length == 2) return parts.pop().split(";").shift();
  }
  if (getCookie('api_width') == 'wide') {
    $('a.resize').click();
  }

});
