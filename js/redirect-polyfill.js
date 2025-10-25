/**
 * Polyfill file to ensure Redirect is available globally
 * This script is used when the extension needs Redirect outside of module context
 */

// Import Redirect from ES module
import { Redirect } from './redirect.js';

// Make it globally available
window.Redirect = Redirect;

console.log('Redirect polyfill loaded successfully'); 