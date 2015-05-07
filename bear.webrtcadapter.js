/**
 * @Copyright 2015 Cisco Systems Inc. All rights reserved.
 *
 * @file browserutil
 * @author rainz
 * @version 1.0
 * @date 3/24/15
 *
 * comments
 */

//var bear = (function(bear) {
    //cross browser webrtc objects
    var RTCSessionDescription = window.mozRTCSessionDescription || window.webkitRTCSessionDescription || window.RTCSessionDescription;
    var RTCPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
    var RTCIceCandidate = window.RTCIceCandidate || window.mozRTCIceCandidate;
    var BlobBuilder = window.WebKitBlobBuilder || window.MozBlobBuilder || window.MSBlobBuilder || window.BlobBuilder;
    var MediaStream = window.MediaStream || window.webkitMediaStream || window.mozMediaStream;

    var getUserMedia = null;
    var attachMediaStream = null;
    var reattachMediaStream = null;
    var webrtcDetectedBrowser = null;
    var webrtcDetectedVersion = null;

    if (navigator.mozGetUserMedia) {
        webrtcDetectedBrowser = 'firefox';
        webrtcDetectedVersion = parseInt(navigator.userAgent.match(/Firefox\/([0-9]+)\./)[1], 10);

        // getUserMedia shim (only difference is the prefix).
        // Code from Adam Barth.
        getUserMedia = navigator.mozGetUserMedia.bind(navigator);
        navigator.getUserMedia = getUserMedia;

        // Attach a media stream to an element.
        attachMediaStream = function (element, stream) {
            console.log('Attaching media stream');
            element.mozSrcObject = stream;
        };

        reattachMediaStream = function (to, from) {
            console.log('Reattaching media stream');
            to.mozSrcObject = from.mozSrcObject;
        };

    } else if (navigator.webkitGetUserMedia) {
        webrtcDetectedBrowser = 'chrome';
        // Temporary fix until crbug/374263 is fixed.
        // Setting Chrome version to 999, if version is unavailable.
        var result = navigator.userAgent.match(/Chrom(e|ium)\/([0-9]+)\./);
        if (result !== null) {
            webrtcDetectedVersion = parseInt(result[2], 10);
        } else {
            webrtcDetectedVersion = 999;
        }

        // Get UserMedia (only difference is the prefix).
        // Code from Adam Barth.
        getUserMedia = navigator.webkitGetUserMedia.bind(navigator);
        navigator.getUserMedia = getUserMedia;

        // Attach a media stream to an element.
        attachMediaStream = function (element, stream) {
            if (typeof element.srcObject !== 'undefined') {
                element.srcObject = stream;
            } else if (typeof element.mozSrcObject !== 'undefined') {
                element.mozSrcObject = stream;
            } else if (typeof element.src !== 'undefined') {
                element.src = URL.createObjectURL(stream);
            } else {
                console.log('Error attaching stream to element.');
            }
        };

        reattachMediaStream = function (to, from) {
            to.src = from.src;
        };
    } else {
        console.log('Browser does not appear to be WebRTC-capable');
    }
//})(bear || {});