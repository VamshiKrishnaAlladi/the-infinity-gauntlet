const fc = require( 'fast-check' );
const {
    validUrlPatternArbitrary,
    protocolArbitrary,
    domainPrefixArbitrary,
    domainPrefixSimpleArbitrary,
    domainNameArbitrary,
    tldArbitrary,
    urlPathArbitrary,
    uniqueBlockedListArbitrary
} = require( '../helpers/generators' );
const {
    simulateNavigationInterception,
    createNavigationEvent,
    urlDoesNotMatchAnyPattern
} = require( '../helpers/navigation' );

describe( 'Feature: url-blocker, Property 9: Blocked URL Navigation Interception', () => {
    const uniqueBlockedList = uniqueBlockedListArbitrary( { minLength: 1, maxLength: 20 } );

    it( 'should block navigation when target URL matches a blocked pattern', async () => {
        await fc.assert(
            fc.asyncProperty(
                protocolArbitrary,
                domainPrefixSimpleArbitrary,
                validUrlPatternArbitrary,
                urlPathArbitrary,
                async ( protocol, domainPrefix, blockedPattern, path ) => {
                    const targetUrl = protocol + domainPrefix + blockedPattern + path;
                    const result = simulateNavigationInterception( targetUrl, [ blockedPattern ] );
                    expect( result.blocked ).toBe( true );
                    expect( result.reason ).toBe( 'matched-blocked-pattern' );
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should redirect to blocked page with correct URL parameter when blocking', async () => {
        await fc.assert(
            fc.asyncProperty(
                protocolArbitrary,
                domainPrefixSimpleArbitrary,
                validUrlPatternArbitrary,
                urlPathArbitrary,
                async ( protocol, domainPrefix, blockedPattern, path ) => {
                    const targetUrl = protocol + domainPrefix + blockedPattern + path;
                    const result = simulateNavigationInterception( targetUrl, [ blockedPattern ] );
                    expect( result.redirectUrl ).not.toBeNull();
                    expect( result.redirectUrl ).toContain( 'blocked.html' );
                    expect( new URL( result.redirectUrl ).searchParams.get( 'url' ) ).toBe( targetUrl );
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should block navigation when any pattern in the blocked list matches', async () => {
        await fc.assert(
            fc.asyncProperty(
                protocolArbitrary,
                domainPrefixSimpleArbitrary,
                validUrlPatternArbitrary,
                urlPathArbitrary,
                uniqueBlockedList,
                async ( protocol, domainPrefix, matchingPattern, path, otherPatterns ) => {
                    const targetUrl = protocol + domainPrefix + matchingPattern + path;
                    const blockedUrls = [ ...otherPatterns, matchingPattern ];
                    const result = simulateNavigationInterception( targetUrl, blockedUrls );
                    expect( result.blocked ).toBe( true );
                    expect( result.reason ).toBe( 'matched-blocked-pattern' );
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should block navigation with case-insensitive pattern matching', async () => {
        await fc.assert(
            fc.asyncProperty(
                protocolArbitrary,
                domainPrefixSimpleArbitrary,
                validUrlPatternArbitrary,
                urlPathArbitrary,
                async ( protocol, domainPrefix, blockedPattern, path ) => {
                    const targetUrl = protocol + domainPrefix + blockedPattern + path;
                    const upper = blockedPattern.toUpperCase();
                    const lower = blockedPattern.toLowerCase();
                    const mixed = blockedPattern.split( '' ).map( ( c, i ) =>
                        i % 2 === 0 ? c.toUpperCase() : c.toLowerCase()
                    ).join( '' );
                    expect( simulateNavigationInterception( targetUrl, [ upper ] ).blocked ).toBe( true );
                    expect( simulateNavigationInterception( targetUrl, [ lower ] ).blocked ).toBe( true );
                    expect( simulateNavigationInterception( targetUrl, [ mixed ] ).blocked ).toBe( true );
                    expect( simulateNavigationInterception( targetUrl.toUpperCase(), [ blockedPattern ] ).blocked ).toBe( true );
                    expect( simulateNavigationInterception( targetUrl.toLowerCase(), [ blockedPattern ] ).blocked ).toBe( true );
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should skip chrome:// URLs and not block them', async () => {
        await fc.assert(
            fc.asyncProperty(
                validUrlPatternArbitrary,
                uniqueBlockedList,
                async ( chromePath, blockedUrls ) => {
                    const result = simulateNavigationInterception( 'chrome://' + chromePath, blockedUrls );
                    expect( result.blocked ).toBe( false );
                    expect( result.reason ).toBe( 'internal-url' );
                    expect( result.redirectUrl ).toBeNull();
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should skip chrome-extension:// URLs and not block them', async () => {
        await fc.assert(
            fc.asyncProperty(
                validUrlPatternArbitrary,
                uniqueBlockedList,
                async ( extensionPath, blockedUrls ) => {
                    const result = simulateNavigationInterception( 'chrome-extension://' + extensionPath, blockedUrls );
                    expect( result.blocked ).toBe( false );
                    expect( result.reason ).toBe( 'internal-url' );
                    expect( result.redirectUrl ).toBeNull();
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should skip about: URLs and not block them', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.constantFrom( 'blank', 'newtab', 'settings', 'extensions', 'history' ),
                uniqueBlockedList,
                async ( aboutPage, blockedUrls ) => {
                    const result = simulateNavigationInterception( 'about:' + aboutPage, blockedUrls );
                    expect( result.blocked ).toBe( false );
                    expect( result.reason ).toBe( 'internal-url' );
                    expect( result.redirectUrl ).toBeNull();
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should handle main frame navigation (frameId === 0)', async () => {
        await fc.assert(
            fc.asyncProperty(
                protocolArbitrary,
                domainPrefixSimpleArbitrary,
                validUrlPatternArbitrary,
                urlPathArbitrary,
                fc.integer( { min: 1, max: 100 } ),
                async ( protocol, domainPrefix, blockedPattern, path, tabId ) => {
                    const targetUrl = protocol + domainPrefix + blockedPattern + path;
                    const event = createNavigationEvent( targetUrl, tabId, 0 );
                    const result = simulateNavigationInterception( event.url, [ blockedPattern ] );
                    expect( result.blocked ).toBe( true );
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should correctly encode special characters in redirect URL parameter', async () => {
        await fc.assert(
            fc.asyncProperty(
                protocolArbitrary,
                domainNameArbitrary,
                tldArbitrary,
                fc.stringOf( fc.constantFrom( '/', '?', '=', '&', '#', '%', '+', ' ' ), { minLength: 1, maxLength: 10 } ),
                async ( protocol, domain, tld, specialChars ) => {
                    const targetUrl = protocol + domain + tld + '/path' + specialChars;
                    const result = simulateNavigationInterception( targetUrl, [ domain + tld ] );
                    if ( result.blocked ) {
                        const decoded = new URL( result.redirectUrl ).searchParams.get( 'url' );
                        expect( decoded ).toBe( targetUrl );
                    }
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should block realistic URL examples correctly', () => {
        const cases = [
            [ 'https://www.youtube.com/shorts/abc123', [ 'youtube.com/shorts' ], true ],
            [ 'https://twitter.com/user/status/123', [ 'twitter.com' ], true ],
            [ 'https://www.reddit.com/r/all/hot', [ 'reddit.com/r/all' ], true ],
            [ 'https://www.facebook.com/feed', [ 'facebook.com' ], true ],
            [ 'https://www.instagram.com/explore', [ 'instagram.com' ], true ]
        ];
        cases.forEach( ( [ targetUrl, blockedUrls, shouldBlock ] ) => {
            const result = simulateNavigationInterception( targetUrl, blockedUrls );
            expect( result.blocked ).toBe( shouldBlock );
            if ( shouldBlock ) {
                expect( result.redirectUrl ).toContain( 'blocked.html' );
                expect( result.redirectUrl ).toContain( encodeURIComponent( targetUrl ) );
            }
        } );
    } );

    it( 'should handle multiple blocked patterns with partial matches', async () => {
        await fc.assert(
            fc.asyncProperty(
                protocolArbitrary,
                domainNameArbitrary,
                tldArbitrary,
                urlPathArbitrary,
                async ( protocol, domain, tld, path ) => {
                    const targetUrl = protocol + 'www.' + domain + tld + path;
                    const blockedUrls = [ 'nonexistent.com', 'another-site.org', domain + tld, 'different-domain.net' ];
                    const result = simulateNavigationInterception( targetUrl, blockedUrls );
                    expect( result.blocked ).toBe( true );
                    expect( result.reason ).toBe( 'matched-blocked-pattern' );
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should handle empty blocked list without blocking', async () => {
        await fc.assert(
            fc.asyncProperty(
                protocolArbitrary,
                domainNameArbitrary,
                tldArbitrary,
                urlPathArbitrary,
                async ( protocol, domain, tld, path ) => {
                    const targetUrl = protocol + domain + tld + path;
                    const result = simulateNavigationInterception( targetUrl, [] );
                    expect( result.blocked ).toBe( false );
                    expect( result.reason ).toBe( 'no-match' );
                    expect( result.redirectUrl ).toBeNull();
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should handle patterns with leading/trailing whitespace', async () => {
        await fc.assert(
            fc.asyncProperty(
                protocolArbitrary,
                domainPrefixSimpleArbitrary,
                validUrlPatternArbitrary,
                urlPathArbitrary,
                async ( protocol, domainPrefix, blockedPattern, path ) => {
                    const targetUrl = protocol + domainPrefix + blockedPattern + path;
                    const patterns = [ '  ' + blockedPattern, blockedPattern + '  ', '  ' + blockedPattern + '  ' ];
                    patterns.forEach( p => {
                        expect( simulateNavigationInterception( targetUrl, [ p ] ).blocked ).toBe( true );
                    } );
                }
            ),
            { numRuns: 100 }
        );
    } );
} );

describe( 'Feature: url-blocker, Property 10: Non-Blocked URL Pass-Through', () => {
    const uniqueBlockedList = uniqueBlockedListArbitrary( { minLength: 0, maxLength: 20 } );

    it( 'should allow navigation when target URL does not match any blocked pattern', async () => {
        await fc.assert(
            fc.asyncProperty(
                protocolArbitrary,
                domainNameArbitrary,
                tldArbitrary,
                urlPathArbitrary,
                uniqueBlockedList,
                async ( protocol, domain, tld, path, blockedUrls ) => {
                    const targetUrl = protocol + domain + tld + path;
                    if ( urlDoesNotMatchAnyPattern( targetUrl, blockedUrls ) ) {
                        const result = simulateNavigationInterception( targetUrl, blockedUrls );
                        expect( result.blocked ).toBe( false );
                        expect( result.reason ).toBe( 'no-match' );
                        expect( result.redirectUrl ).toBeNull();
                    }
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should allow navigation with empty blocked list', async () => {
        await fc.assert(
            fc.asyncProperty(
                protocolArbitrary,
                domainNameArbitrary,
                tldArbitrary,
                urlPathArbitrary,
                async ( protocol, domain, tld, path ) => {
                    const targetUrl = protocol + domain + tld + path;
                    const result = simulateNavigationInterception( targetUrl, [] );
                    expect( result.blocked ).toBe( false );
                    expect( result.reason ).toBe( 'no-match' );
                    expect( result.redirectUrl ).toBeNull();
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should allow navigation when blocked patterns are completely different from target URL', async () => {
        await fc.assert(
            fc.asyncProperty(
                protocolArbitrary,
                fc.constantFrom( 'alpha', 'beta', 'gamma', 'delta', 'epsilon' ),
                tldArbitrary,
                urlPathArbitrary,
                async ( protocol, domain, tld, path ) => {
                    const targetUrl = protocol + domain + tld + path;
                    const blockedUrls = [ 'zzzzunique1.xyz', 'qqqqunique2.abc', 'xxxxunique3.def' ];
                    const result = simulateNavigationInterception( targetUrl, blockedUrls );
                    expect( result.blocked ).toBe( false );
                    expect( result.reason ).toBe( 'no-match' );
                    expect( result.redirectUrl ).toBeNull();
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should allow navigation for realistic non-blocked URL examples', () => {
        const cases = [
            [ 'https://www.google.com/search?q=test', [ 'youtube.com', 'facebook.com', 'twitter.com' ] ],
            [ 'https://github.com/user/repo', [ 'reddit.com', 'instagram.com' ] ],
            [ 'https://stackoverflow.com/questions/123', [ 'youtube.com/shorts', 'tiktok.com' ] ],
            [ 'https://docs.microsoft.com/en-us/dotnet', [ 'facebook.com', 'twitter.com', 'reddit.com' ] ],
            [ 'https://www.amazon.com/product/123', [ 'youtube.com', 'netflix.com' ] ]
        ];
        cases.forEach( ( [ targetUrl, blockedUrls ] ) => {
            const result = simulateNavigationInterception( targetUrl, blockedUrls );
            expect( result.blocked ).toBe( false );
            expect( result.reason ).toBe( 'no-match' );
            expect( result.redirectUrl ).toBeNull();
        } );
    } );

    it( 'should allow navigation when pattern is similar but not a substring match', async () => {
        await fc.assert(
            fc.asyncProperty(
                protocolArbitrary,
                domainPrefixSimpleArbitrary,
                async ( protocol, domainPrefix ) => {
                    const targetUrl = protocol + domainPrefix + 'example.com/page';
                    const blockedUrls = [ 'examples.com', 'myexample.com', 'example.org', 'examplesite.com', 'ex-ample.com' ];
                    const result = simulateNavigationInterception( targetUrl, blockedUrls );
                    expect( result.blocked ).toBe( false );
                    expect( result.reason ).toBe( 'no-match' );
                    expect( result.redirectUrl ).toBeNull();
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should allow navigation and not interfere with navigation event details', async () => {
        await fc.assert(
            fc.asyncProperty(
                protocolArbitrary,
                domainNameArbitrary,
                tldArbitrary,
                urlPathArbitrary,
                fc.integer( { min: 1, max: 1000 } ),
                async ( protocol, domain, tld, path, tabId ) => {
                    const targetUrl = protocol + domain + tld + path;
                    const navEvent = createNavigationEvent( targetUrl, tabId, 0 );
                    const result = simulateNavigationInterception( navEvent.url, [] );
                    expect( result.blocked ).toBe( false );
                    expect( result.redirectUrl ).toBeNull();
                    expect( navEvent.url ).toBe( targetUrl );
                    expect( navEvent.tabId ).toBe( tabId );
                    expect( navEvent.frameId ).toBe( 0 );
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should allow navigation when blocked list contains only whitespace patterns', async () => {
        await fc.assert(
            fc.asyncProperty(
                protocolArbitrary,
                domainNameArbitrary,
                tldArbitrary,
                urlPathArbitrary,
                async ( protocol, domain, tld, path ) => {
                    const targetUrl = protocol + domain + tld + path;
                    const blockedUrls = [ '   ', '\t', '\n', '  \t  ' ];
                    const result = simulateNavigationInterception( targetUrl, blockedUrls );
                    expect( result.blocked ).toBe( false );
                    expect( result.reason ).toBe( 'no-match' );
                    expect( result.redirectUrl ).toBeNull();
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should allow navigation for URLs with special characters when not in blocked list', async () => {
        await fc.assert(
            fc.asyncProperty(
                protocolArbitrary,
                domainNameArbitrary,
                tldArbitrary,
                fc.stringOf( fc.constantFrom( '/', '?', '=', '&', '#', '%', '+' ), { minLength: 1, maxLength: 10 } ),
                async ( protocol, domain, tld, specialChars ) => {
                    const targetUrl = protocol + domain + tld + '/path' + specialChars;
                    const blockedUrls = [ 'completely-different-site.xyz' ];
                    const result = simulateNavigationInterception( targetUrl, blockedUrls );
                    expect( result.blocked ).toBe( false );
                    expect( result.reason ).toBe( 'no-match' );
                    expect( result.redirectUrl ).toBeNull();
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should allow navigation for long URLs when not in blocked list', async () => {
        await fc.assert(
            fc.asyncProperty(
                protocolArbitrary,
                domainNameArbitrary,
                tldArbitrary,
                fc.stringOf(
                    fc.constantFrom( 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', '/', '-', '_', '0', '1', '2', '3', '4', '5' ),
                    { minLength: 50, maxLength: 200 }
                ),
                async ( protocol, domain, tld, longPath ) => {
                    const targetUrl = protocol + domain + tld + '/' + longPath;
                    const blockedUrls = [ 'unrelated-site.xyz', 'another-site.abc' ];
                    const result = simulateNavigationInterception( targetUrl, blockedUrls );
                    expect( result.blocked ).toBe( false );
                    expect( result.reason ).toBe( 'no-match' );
                    expect( result.redirectUrl ).toBeNull();
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should allow navigation with case variations when pattern does not match', async () => {
        await fc.assert(
            fc.asyncProperty(
                protocolArbitrary,
                domainPrefixSimpleArbitrary,
                async ( protocol, domainPrefix ) => {
                    const targetUrl = protocol + domainPrefix + 'MyWebsite.COM/Page';
                    const blockedUrls = [ 'YOUTUBE.COM', 'facebook.com', 'TWITTER.COM' ];
                    const result = simulateNavigationInterception( targetUrl, blockedUrls );
                    expect( result.blocked ).toBe( false );
                    expect( result.reason ).toBe( 'no-match' );
                    expect( result.redirectUrl ).toBeNull();
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should allow navigation when blocked list has many patterns but none match', async () => {
        await fc.assert(
            fc.asyncProperty(
                protocolArbitrary,
                domainPrefixSimpleArbitrary,
                async ( protocol, domainPrefix ) => {
                    const targetUrl = protocol + domainPrefix + 'unique-safe-site.com/page';
                    const blockedUrls = [
                        'youtube.com', 'facebook.com', 'twitter.com', 'reddit.com', 'instagram.com',
                        'tiktok.com', 'snapchat.com', 'pinterest.com', 'linkedin.com', 'tumblr.com',
                        'discord.com', 'twitch.tv', 'netflix.com', 'hulu.com', 'amazon.com/video'
                    ];
                    const result = simulateNavigationInterception( targetUrl, blockedUrls );
                    expect( result.blocked ).toBe( false );
                    expect( result.reason ).toBe( 'no-match' );
                    expect( result.redirectUrl ).toBeNull();
                }
            ),
            { numRuns: 100 }
        );
    } );
} );
