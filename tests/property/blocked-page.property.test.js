const fc = require( 'fast-check' );
const {
    protocolArbitrary,
    domainPrefixArbitrary,
    domainPrefixSimpleArbitrary,
    domainNameArbitrary,
    tldArbitrary,
    urlPathArbitrary,
    queryParamArbitrary
} = require( '../helpers/generators' );
const {
    setupBlockedPageDOM,
    setBlockedUrlParam,
    clearBlockedUrlParam,
    checkBlockedPageDisplay,
    extractDomain,
    isPageIsolated
} = require( '../helpers/blocked-page' );
const { getBlockedUrl, displayBlockedMessage } = require( '../../src/blocked' );

describe( 'Feature: url-blocker, Property 11: Blocked Page Content Display', () => {
    beforeEach( () => setupBlockedPageDOM() );
    afterEach( () => {
        document.body.innerHTML = '';
        clearBlockedUrlParam();
    } );

    it( 'should display the blocked URL on the blocked page', async () => {
        await fc.assert(
            fc.asyncProperty(
                protocolArbitrary,
                domainPrefixArbitrary,
                domainNameArbitrary,
                tldArbitrary,
                urlPathArbitrary,
                async ( protocol, domainPrefix, domain, tld, path ) => {
                    // Construct a blocked URL
                    const blockedUrl = protocol + domainPrefix + domain + tld + path;

                    // Set up the blocked URL parameter
                    setBlockedUrlParam( blockedUrl );

                    // Get the blocked URL from query parameters
                    const extractedUrl = getBlockedUrl();

                    // Display the blocked message
                    displayBlockedMessage( extractedUrl );

                    // Check that the URL is displayed
                    const display = checkBlockedPageDisplay();

                    // Requirement 5.1: The blocked URL should be displayed
                    expect( display.hasUrlElement ).toBe( true );
                    expect( display.urlContent ).toBe( blockedUrl );
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should display a message indicating the URL is blocked', async () => {
        await fc.assert(
            fc.asyncProperty(
                protocolArbitrary,
                domainPrefixArbitrary,
                domainNameArbitrary,
                tldArbitrary,
                urlPathArbitrary,
                async ( protocol, domainPrefix, domain, tld, path ) => {
                    // Construct a blocked URL
                    const blockedUrl = protocol + domainPrefix + domain + tld + path;

                    // Set up the blocked URL parameter
                    setBlockedUrlParam( blockedUrl );

                    // Get the blocked URL from query parameters
                    const extractedUrl = getBlockedUrl();

                    // Display the blocked message
                    displayBlockedMessage( extractedUrl );

                    // Check that the blocked message is displayed
                    const display = checkBlockedPageDisplay();

                    // Requirement 5.2: A message indicating the URL is blocked should be displayed
                    expect( display.hasMessageElement ).toBe( true );
                    expect( display.messageContent ).toContain( 'blocked' );
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should display both URL and blocked message together', async () => {
        await fc.assert(
            fc.asyncProperty(
                protocolArbitrary,
                domainPrefixArbitrary,
                domainNameArbitrary,
                tldArbitrary,
                urlPathArbitrary,
                async ( protocol, domainPrefix, domain, tld, path ) => {
                    // Construct a blocked URL
                    const blockedUrl = protocol + domainPrefix + domain + tld + path;

                    // Set up the blocked URL parameter
                    setBlockedUrlParam( blockedUrl );

                    // Get the blocked URL from query parameters
                    const extractedUrl = getBlockedUrl();

                    // Display the blocked message
                    displayBlockedMessage( extractedUrl );

                    // Check that both elements are displayed
                    const display = checkBlockedPageDisplay();

                    // Both URL and message should be present
                    expect( display.hasUrlElement ).toBe( true );
                    expect( display.hasMessageElement ).toBe( true );
                    expect( display.urlContent ).toBe( blockedUrl );
                    expect( display.messageContent ).toContain( 'blocked' );
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should correctly extract URL from query parameters', async () => {
        await fc.assert(
            fc.asyncProperty(
                protocolArbitrary,
                domainPrefixArbitrary,
                domainNameArbitrary,
                tldArbitrary,
                urlPathArbitrary,
                async ( protocol, domainPrefix, domain, tld, path ) => {
                    // Construct a blocked URL
                    const blockedUrl = protocol + domainPrefix + domain + tld + path;

                    // Set up the blocked URL parameter
                    setBlockedUrlParam( blockedUrl );

                    // Get the blocked URL from query parameters
                    const extractedUrl = getBlockedUrl();

                    // The extracted URL should match the original blocked URL
                    expect( extractedUrl ).toBe( blockedUrl );
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should handle URLs with query parameters', async () => {
        await fc.assert(
            fc.asyncProperty(
                protocolArbitrary,
                domainNameArbitrary,
                tldArbitrary,
                urlPathArbitrary,
                queryParamArbitrary,
                async ( protocol, domain, tld, path, queryParam ) => {
                    // Construct a blocked URL with query parameters
                    const blockedUrl = protocol + domain + tld + path +
                        ( queryParam.length > 0 ? '?' + queryParam : '' );

                    // Set up the blocked URL parameter
                    setBlockedUrlParam( blockedUrl );

                    // Get the blocked URL from query parameters
                    const extractedUrl = getBlockedUrl();

                    // Display the blocked message
                    displayBlockedMessage( extractedUrl );

                    // Check that the URL is correctly displayed
                    const display = checkBlockedPageDisplay();

                    expect( display.hasUrlElement ).toBe( true );
                    expect( display.urlContent ).toBe( blockedUrl );
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should handle URLs with special characters', async () => {
        await fc.assert(
            fc.asyncProperty(
                protocolArbitrary,
                domainNameArbitrary,
                tldArbitrary,
                fc.stringOf(
                    fc.constantFrom( '/', '-', '_', '.', '~' ),
                    { minLength: 1, maxLength: 10 }
                ),
                async ( protocol, domain, tld, specialPath ) => {
                    // Construct a blocked URL with special characters in path
                    const blockedUrl = protocol + domain + tld + '/path' + specialPath;

                    // Set up the blocked URL parameter
                    setBlockedUrlParam( blockedUrl );

                    // Get the blocked URL from query parameters
                    const extractedUrl = getBlockedUrl();

                    // Display the blocked message
                    displayBlockedMessage( extractedUrl );

                    // Check that the URL is correctly displayed
                    const display = checkBlockedPageDisplay();

                    expect( display.hasUrlElement ).toBe( true );
                    expect( display.urlContent ).toBe( blockedUrl );
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should display "Unknown URL" when no URL parameter is provided', () => {
        // Clear the URL parameter
        clearBlockedUrlParam();

        // Get the blocked URL (should be empty)
        const extractedUrl = getBlockedUrl();

        // Display the blocked message
        displayBlockedMessage( extractedUrl );

        // Check that "Unknown URL" is displayed
        const blockedUrlElement = document.getElementById( 'blocked-url' );
        expect( blockedUrlElement.textContent ).toBe( 'Unknown URL' );
    } );

    it( 'should display the heading "URL Blocked"', async () => {
        await fc.assert(
            fc.asyncProperty(
                protocolArbitrary,
                domainNameArbitrary,
                tldArbitrary,
                async ( protocol, domain, tld ) => {
                    // Construct a blocked URL
                    const blockedUrl = protocol + domain + tld;

                    // Set up the blocked URL parameter
                    setBlockedUrlParam( blockedUrl );

                    // Check that the heading is displayed
                    const display = checkBlockedPageDisplay();

                    expect( display.hasHeading ).toBe( true );
                    expect( display.headingContent ).toBe( 'URL Blocked' );
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should handle long URLs correctly', async () => {
        await fc.assert(
            fc.asyncProperty(
                protocolArbitrary,
                domainNameArbitrary,
                tldArbitrary,
                fc.stringOf(
                    fc.constantFrom(
                        'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j',
                        '/', '-', '_'
                    ),
                    { minLength: 100, maxLength: 200 }
                ),
                async ( protocol, domain, tld, longPath ) => {
                    // Construct a long blocked URL
                    const blockedUrl = protocol + domain + tld + '/' + longPath;

                    // Set up the blocked URL parameter
                    setBlockedUrlParam( blockedUrl );

                    // Get the blocked URL from query parameters
                    const extractedUrl = getBlockedUrl();

                    // Display the blocked message
                    displayBlockedMessage( extractedUrl );

                    // Check that the full URL is displayed
                    const display = checkBlockedPageDisplay();

                    expect( display.hasUrlElement ).toBe( true );
                    expect( display.urlContent ).toBe( blockedUrl );
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should handle realistic blocked URL examples', () => {
        // Test with realistic URL examples from the design document
        const testCases = [
            'https://www.youtube.com/shorts/abc123',
            'https://twitter.com/user/status/123',
            'https://www.reddit.com/r/all/hot',
            'https://www.facebook.com/feed',
            'https://www.instagram.com/explore',
            'http://example.com/page?param=value',
            'https://subdomain.example.org/path/to/resource'
        ];

        testCases.forEach( blockedUrl => {
            // Set up the blocked URL parameter
            setBlockedUrlParam( blockedUrl );

            // Get the blocked URL from query parameters
            const extractedUrl = getBlockedUrl();

            // Display the blocked message
            displayBlockedMessage( extractedUrl );

            // Check that both URL and message are displayed
            const display = checkBlockedPageDisplay();

            // Requirement 5.1: The blocked URL should be displayed
            expect( display.hasUrlElement ).toBe( true );
            expect( display.urlContent ).toBe( blockedUrl );

            // Requirement 5.2: A message indicating the URL is blocked should be displayed
            expect( display.hasMessageElement ).toBe( true );
            expect( display.messageContent ).toContain( 'blocked' );
        } );
    } );
} );

describe( 'Feature: url-blocker, Property 12: Blocked Page Content Isolation', () => {
    beforeEach( () => setupBlockedPageDOM() );
    afterEach( () => {
        document.body.innerHTML = '';
        clearBlockedUrlParam();
    } );

    it( 'should be completely isolated from the blocked domain (no scripts, styles, images, iframes, links, objects, embeds, forms)', async () => {
        await fc.assert(
            fc.asyncProperty(
                protocolArbitrary,
                domainPrefixArbitrary,
                domainNameArbitrary,
                tldArbitrary,
                urlPathArbitrary,
                async ( protocol, domainPrefix, domain, tld, path ) => {
                    // Construct a blocked URL
                    const blockedUrl = protocol + domainPrefix + domain + tld + path;
                    const blockedDomain = extractDomain( blockedUrl );

                    // Set up the blocked URL parameter
                    setBlockedUrlParam( blockedUrl );

                    // Get the blocked URL and display the message
                    const extractedUrl = getBlockedUrl();
                    displayBlockedMessage( extractedUrl );

                    // Check complete isolation from blocked domain
                    const isolated = isPageIsolated( blockedDomain );

                    // Requirement 5.4: No content from blocked domain should be loaded
                    expect( isolated ).toBe( true );
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should display blocked URL as text only, not as a clickable link', async () => {
        await fc.assert(
            fc.asyncProperty(
                protocolArbitrary,
                domainPrefixArbitrary,
                domainNameArbitrary,
                tldArbitrary,
                urlPathArbitrary,
                async ( protocol, domainPrefix, domain, tld, path ) => {
                    // Construct a blocked URL
                    const blockedUrl = protocol + domainPrefix + domain + tld + path;

                    // Set up the blocked URL parameter
                    setBlockedUrlParam( blockedUrl );

                    // Get the blocked URL and display the message
                    const extractedUrl = getBlockedUrl();
                    displayBlockedMessage( extractedUrl );

                    // Check that the blocked URL element is not a link
                    const blockedUrlElement = document.getElementById( 'blocked-url' );

                    // The blocked URL should be displayed as text, not as a clickable link
                    expect( blockedUrlElement.tagName.toLowerCase() ).not.toBe( 'a' );

                    // The element should not have an href attribute
                    expect( blockedUrlElement.hasAttribute( 'href' ) ).toBe( false );

                    // The content should be plain text
                    expect( blockedUrlElement.textContent ).toBe( blockedUrl );
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should handle realistic blocked URL examples with content isolation', () => {
        // Test with realistic URL examples from the design document
        const testCases = [
            'https://www.youtube.com/shorts/abc123',
            'https://twitter.com/user/status/123',
            'https://www.reddit.com/r/all/hot',
            'https://www.facebook.com/feed',
            'https://www.instagram.com/explore',
            'http://example.com/page?param=value',
            'https://subdomain.example.org/path/to/resource'
        ];

        testCases.forEach( blockedUrl => {
            // Reset DOM for each test case
            setupBlockedPageDOM();

            const blockedDomain = extractDomain( blockedUrl );

            // Set up the blocked URL parameter
            setBlockedUrlParam( blockedUrl );

            // Get the blocked URL from query parameters
            const extractedUrl = getBlockedUrl();

            // Display the blocked message
            displayBlockedMessage( extractedUrl );

            // Check complete isolation from blocked domain
            const isolated = isPageIsolated( blockedDomain );

            // Requirement 5.4: No content from blocked domain should be loaded
            expect( isolated ).toBe( true );

            // The blocked URL should be displayed as text only
            const blockedUrlElement = document.getElementById( 'blocked-url' );
            expect( blockedUrlElement.tagName.toLowerCase() ).not.toBe( 'a' );
            expect( blockedUrlElement.textContent ).toBe( blockedUrl );
        } );
    } );

    it( 'should only use local extension resources', async () => {
        await fc.assert(
            fc.asyncProperty(
                protocolArbitrary,
                domainPrefixArbitrary,
                domainNameArbitrary,
                tldArbitrary,
                async ( protocol, domainPrefix, domain, tld ) => {
                    // Construct a blocked URL
                    const blockedUrl = protocol + domainPrefix + domain + tld;

                    // Set up the blocked URL parameter
                    setBlockedUrlParam( blockedUrl );

                    // Get the blocked URL and display the message
                    const extractedUrl = getBlockedUrl();
                    displayBlockedMessage( extractedUrl );

                    // Check all script sources - should be local only
                    const scripts = document.querySelectorAll( 'script[src]' );
                    scripts.forEach( script => {
                        const src = script.getAttribute( 'src' ) || '';
                        // Local scripts should not start with http:// or https://
                        const isExternal = src.startsWith( 'http://' ) || src.startsWith( 'https://' );
                        expect( isExternal ).toBe( false );
                    } );

                    // Check all link sources - should be local only
                    const links = document.querySelectorAll( 'link[href]' );
                    links.forEach( link => {
                        const href = link.getAttribute( 'href' ) || '';
                        // Local links should not start with http:// or https://
                        const isExternal = href.startsWith( 'http://' ) || href.startsWith( 'https://' );
                        expect( isExternal ).toBe( false );
                    } );
                }
            ),
            { numRuns: 100 }
        );
    } );
} );
