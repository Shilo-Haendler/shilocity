function formatArray(array, separator, manipulationFn){
	var str = "";
	if (array.length > 0){
		str = str.concat(manipulationFn(array[0]));
		var i;
		for (i = 1; i < array.length; i++){
			str = str.concat(separator).concat(manipulationFn(array[i]));
		}
	}
	return str;
}



function Map(){
	this.entries = [];
	
	this.contains = function(key){
		var entry = this.getEntry(key);
		return entry !== null;
	};
	
	this.put = function(key, value){
		var entry = this.getEntry(key);
		if (entry === null){
			this.entries.push({"key": key, "value" : value});
		}
		else{
			entry.value = value;
		}
	};
	
	this.get = function(key){
		var entry = this.getEntry(key);
		return entry === null ? null : entry.value;
	};
	
	this.getEntry = function(key){
		var i;
		for (i=0; i < this.entries.length; i++){
			var currEntry = this.entries[i];
			if (currEntry.key === key) 
			{
				return currEntry;
			}
		}
		return null;				
	};
}



function ab2str(buf, bufOffset, bufLength) {
	try {
		bufOffset = bufOffset || 0;
		bufLength = bufLength || buf.byteLength;
		var str = "";
		var ab = new Uint8Array(buf);
		var abLen = bufLength; //ab.length;
		var CHUNK_SIZE = Math.pow(2, 16);
		var offset, len, subab;
		for (offset = bufOffset; offset < abLen; offset += CHUNK_SIZE) {
			len = Math.min(CHUNK_SIZE, abLen-offset);
			subab = ab.subarray(offset, offset+len);
			str += String.fromCharCode.apply(null, subab);
		}
		return str;
//		return String.fromCharCode.apply(null, new Uint8Array(buf)); // throws on big data: "arguments array passed to Function.prototype.apply is too large"
	} catch (err) {
		throw new Error("ab2str - " + err.message);
	}
}

function str2ab(str, buf, bufOffset) {
	try {
		buf = (buf instanceof ArrayBuffer) ? buf : new ArrayBuffer(str.length * 2); // 2 bytes for each char
		bufOffset = bufOffset || 0;
		var bufView = new Uint8Array(buf);
		var i, strLen;
		for (i = bufOffset, strLen = str.length; i < strLen; i++) {
			bufView[i] = str.charCodeAt(i);
		}
		return buf;
	} catch (err) {
		throw new Error("str2ab - " + err.message);
	}
}

//function utf82ab(str, buf, bufOffset) {
//	try {
//		buf = (buf instanceof ArrayBuffer) ? buf : new ArrayBuffer(str.length * 2); // 2 bytes for each char
//		bufOffset = bufOffset || 0;
//		var bufView = new Uint8Array(buf);
//		var i, len;
//		for (i = 0, len = str.length*2; i < len; i += 2) {
//			var x = str.charCodeAt(i/2);
//		    var a = x % 256;
//		    x -= a;
//		    x /= 256;
//		    bufView[bufOffset+i] = x;
//		    bufView[bufOffset+i+1] = a;
//		}
//		return buf;
//	} catch (err) {
//		throw new Error("str2ab - " + err.message);
//	}
//}

function arraycopy(srcBuf, srcPos, destBuf, destPos, length) {
	var src = new Uint8Array(srcBuf);
	var dest = new Uint8Array(destBuf);
	var i;
	for (i = 0; i < length; i++) {
		dest[destPos+i] = src[srcPos+i];
	}
}

//************************************************************************************
// UTF-8 Encoding helpers.
// http://ciaranj.blogspot.co.il/2007/11/utf8-characters-encoding-in-javascript.html
// based on the code at http://www.webtoolkit.info
//************************************************************************************
var Utf8Utils= function() {
    function _encode(stringToEncode, insertBOM) {
        stringToEncode = stringToEncode.replace(/\r\n/g,"\n");
        var utftext = [];
        if( insertBOM == true )  {
            utftext[0]=  0xef;
            utftext[1]=  0xbb;
            utftext[2]=  0xbf;
        }

        var n;
        for (n = 0; n < stringToEncode.length; n++) {

            var c = stringToEncode.charCodeAt(n);

            if (c < 128) {
                utftext[utftext.length]= c;
            }
            else if((c > 127) && (c < 2048)) {
                utftext[utftext.length]= (c >> 6) | 192;
                utftext[utftext.length]= (c & 63) | 128;
            }
            else {
                utftext[utftext.length]= (c >> 12) | 224;
                utftext[utftext.length]= ((c >> 6) & 63) | 128;
                utftext[utftext.length]= (c & 63) | 128;
            }

        }
        return utftext;
    }

    var obj= {
        /**
         * Encode javascript string as utf8 byte array
         */
        encode : function(stringToEncode) {
            return _encode( stringToEncode, false);
        },
      
        /**
         * Encode javascript string as utf8 byte array, with a BOM at the start
         */
        encodeWithBOM: function(stringToEncode) {
            return _encode(stringToEncode, true);
        },
      
        /**
         * Decode utf8 byte array to javascript string....
         */
        decode : function(dotNetBytes) {
            var result= "";
            var i= 0;
            var c=0;
            var c1=0;
            var c2=0;
          
            // Perform byte-order check.
            if( dotNetBytes.length >= 3 ) {
                if(   (dotNetBytes[0] & 0xef) == 0xef
                    && (dotNetBytes[1] & 0xbb) == 0xbb
                    && (dotNetBytes[2] & 0xbf) == 0xbf ) {
                    // Hmm byte stream has a BOM at the start, we'll skip this.
                    i= 3;
                }
            }
          
            while( i < dotNetBytes.length ) {
                c= dotNetBytes[i]&0xff;
              
                if( c < 128 ) {
                    result+= String.fromCharCode(c);
                    i++;
                }
                else if( (c > 191) && (c < 224) ) {
                    if( i+1 >= dotNetBytes.length )
                        throw "Un-expected encoding error, UTF-8 stream truncated, or incorrect";
                    c2= dotNetBytes[i+1]&0xff;
                    result+= String.fromCharCode( ((c&31)<<6) | (c2&63) );
                    i+=2;
                }
                else {
                    if( i+2 >= dotNetBytes.length  || i+1 >= dotNetBytes.length )
                        throw "Un-expected encoding error, UTF-8 stream truncated, or incorrect";
                    c2= dotNetBytes[i+1]&0xff;
                    c3= dotNetBytes[i+2]&0xff;
                    result+= String.fromCharCode( ((c&15)<<12) | ((c2&63)<<6) | (c3&63) );
                    i+=3;
                }          
            }                
            return result;
        }
    };
    return obj;
}();