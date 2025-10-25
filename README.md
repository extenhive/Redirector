## Description
Web browser extension (Vivaldi, Chrome, Opera) to redirect URLs based on regex or wildcard patterns.

## Tribute
This extension was developed with inspiration and partial code from Einar Egilsson  (https://github.com/einaregilsson/Redirector). 
In loving memory of Einar Egilsson, who gave us Redirector and selflessly nurtured it for many years.  We miss you Einar, and will always remember your kindness and generosity.

## Download Links
* [Google Chrome and Vivaldi](https://chromewebstore.google.com/detail/redirector/jegbdohdgebjljoljfeinojeobdabpjo)

## Examples
### De-mobilizer
- Example URL: `https://en.m.wikipedia.org/`
- Include pattern: `^(https?://)([a-z0-9-]*\.)m(?:obile)?\.(.*)`
- Redirect to: `$1$2$3`
- Pattern type: Regular Expression
- Description: Always show the desktop version of websites

### AMP redirect
- Example URL: `https://www.google.com/amp/www.example.com/amp/document`
- Include pattern: `^(?:https?://)www.(?:google|bing).com/amp/(?:s/)?(.*)`
- Redirect to: `https://$1`
- Pattern type: Regular Expression
- Description: AMP is bad: <https://80x24.net/post/the-problem-with-amp/>

### Doubleclick escaper
- Example URL: `https://ad.doubleclick.net/ddm/trackclk/N135005.2681608PRIVATENETWORK/B20244?https://www.example.com`
- Include pattern: `^(?:https?://)ad.doubleclick.net/.*\?(http?s://.*)`
- Redirect to: `$1`
- Pattern type: Regular Expression
- Description: Remove doubleclick link tracking / fix problems with doubleclick host-based blocking

### YouTube Shorts to YouTube
- Example URL: `https://www.youtube.com/shorts/video-id`
- Include pattern: `^(?:https?://)(?:www.)?youtube.com/shorts/([a-zA-Z0-9_-]+)(.*)`
- Redirect to: `https://www.youtube.com/watch?v=$1$2`
- Pattern type: Regular Expression
- Description: Redirect YouTube Shorts to regular YouTube
- Advanced option: enable `historyState`

### Fun with !bangs
What are bangs?: <https://duckduckgo.com/bangs>

#### Use DuckDuckGo.com !bangs on Google
- Example URL: `https://www.google.com/search?&ei=-FvkXcOVMo6RRwW5p5DgBg&q=asdfasdf%21+sadfas&oq=%21asdfasdf+sadfas&gs_l=asdfsadfafsgaf`
- Include pattern: `^(?:https?://)(?:www.)google\.(?:com|au|de|co\.uk)/search\?(?:.*)?(?:oq|q)=([^\&]*\+)?((?:%21|!)[^\&]*)`
- Redirect to: `https://duckduckgo.com/?q=$1$2`
- Pattern type: Regular Expression
- Description: Redirect any Google query with a !bang to DDG

### Custom DuckDuckGo.com !bangs

#### DDG !example Base
- Example URL: `https://duckduckgo.com/?q=!`__example__`&get=other`
- Include pattern: `^(?:https?://)(?:.*\.)?duckduckgo.com/\?q=(?:%21|!)`__example__`(?=[^\+]|$)(?=\W|$)`
- Redirect to: `https://example.com/`
- Pattern type: Regular Expression
- Description: Redirect to the base site when !bang is the only search parameter

#### DDG !example Search
- Example URL: `https://duckduckgo.com/?q=searchterm+!`__example__`+searchterm2&get=other`
- Include pattern: `^(?:https?://)(?:.*\.)?duckduckgo.com/\?q=(.*\+)?(?:(?:%21|!)`__example__`)(?:\+([^\&\?\#]*))?(?:\W|$)`
- Redirect to: `https://example.com/?query=$1$2`
- Pattern type: Regular Expression
- Description: Redirect to custom site search

#### DDG !ghh git-history
- Example URL: `https://duckduckgo.com/?q=!ghh+https%3A%2F%2Fgithub.com%2Fbabel%2Fbabel%2Fblob%2Fmaster%2Fpackages%2Fbabel-core%2FREADME.md&adfasfasd`
- Include pattern: `^(?:https?://)duckduckgo.com/\?q=(?:(?:%21|!)ghh\+)(?:.*)(github|gitlab|bitbucket)(?:\.org|\.com)(.*?(?=\&))`
- Redirect to: `https://$1.githistory.xyz$2`
- Pattern type: Regular Expression
- Description: Create new !ghh bang that redirects to <https://githistory.xyz>
- Advanced:
    - Process matches: URL decode
    
### Fast DuckDuckGo.com !bangs

Go directly to frequently used DuckDuckGo bangs to avoid intermediary network requests.

- Example URL: `https://duckduckgo.com/?q=foo+bar+%21google+test+bar`
- Include pattern: `^https://duckduckgo\.com/\?q=(.*)\+(?:%21|!)google\b\+(.*?)(?:&|$)`
- Redirect to: `https://google.com/search?hl=en&q=$1+$2`
- Pattern type: Regular Expression
- Description: DuckDuckGo → Google !bang shortcut (prefix AND suffix)
- Pattern Description: Avoid extraneous + in URL with two separate patterns  
###
  
- Example URL: `https://duckduckgo.com/?q=foo+bar+%21google`
- Include pattern: `^https://duckduckgo\.com/\?q=(.*?)\+?(?:%21|!)google\b\+?(.*?)(?:&|$)`
- Redirect to: `https://google.com/search?hl=en&q=$1$2`
- Pattern type: Regular Expression
- Description: DuckDuckGo → Google !bang shortcut (prefix OR suffix)
- Pattern Description: Avoid extraneous + in URL with two separate patterns
