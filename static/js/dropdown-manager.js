/**
 * Dropdown Manager Module
 * Handles initialization and cascading behavior of searchable dropdowns
 * Depends on: searchable-dropdown.js, jQuery
 */

// Initialize searchable dropdowns when document is ready
$(document).ready(function() {
    initializeSearchableDropdowns();
});

function initializeSearchableDropdowns() {
    // Initialize origin dropdowns
    searchableDropdown.makeSearchable('#origin-water-body', {
        loadUrl: '/api/load/water-bodies',
        searchUrl: '/api/search/water-bodies',
        placeholder: 'Select or search water body...'
    });

    searchableDropdown.makeSearchable('#origin-country', {
        loadUrl: '/api/load/countries',
        searchUrl: '/api/search/countries',
        placeholder: 'Select or search country...',
        additionalParams: {}
    });

    searchableDropdown.makeSearchable('#origin-port', {
        loadUrl: '/api/load/ports',
        searchUrl: '/api/search/ports',
        placeholder: 'Select or search port...',
        additionalParams: {}
    });

    // Initialize destination dropdowns
    searchableDropdown.makeSearchable('#dest-water-body', {
        loadUrl: '/api/load/water-bodies',
        searchUrl: '/api/search/water-bodies',
        placeholder: 'Select or search water body...'
    });

    searchableDropdown.makeSearchable('#dest-country', {
        loadUrl: '/api/load/countries',
        searchUrl: '/api/search/countries',
        placeholder: 'Select or search country...',
        additionalParams: {}
    });

    searchableDropdown.makeSearchable('#dest-port', {
        loadUrl: '/api/load/ports',
        searchUrl: '/api/search/ports',
        placeholder: 'Select or search port...',
        additionalParams: {}
    });

    // Set up cascade behavior
    setupCascadingDropdowns();
}

function setupCascadingDropdowns() {
    // Origin cascade
    $('#origin-water-body').on('change', function() {
        const waterBody = $(this).val();
        
        // Enable country dropdown
        searchableDropdown.setEnabled('#origin-country', !!waterBody);
        
        // Reload country dropdown with new params
        if (waterBody) {
            searchableDropdown.updateSearchParams('#origin-country', { water_body: waterBody });
        }
        
        // Clear dependent dropdowns
        searchableDropdown.clear('#origin-country');
        searchableDropdown.clear('#origin-port');
        searchableDropdown.setEnabled('#origin-port', false);
        
        updateCalculateButton();
    });

    $('#origin-country').on('change', function() {
        const country = $(this).val();
        const waterBody = $('#origin-water-body').val();
        
        // Enable port dropdown
        searchableDropdown.setEnabled('#origin-port', !!country);
        
        // Reload port dropdown with new params
        if (country && waterBody) {
            searchableDropdown.updateSearchParams('#origin-port', { 
                country: country, 
                water_body: waterBody 
            });
        }
        
        // Clear port
        searchableDropdown.clear('#origin-port');
        
        updateCalculateButton();
    });

    $('#origin-port').on('change', function() {
        updateCalculateButton();
    });

    // Destination cascade
    $('#dest-water-body').on('change', function() {
        const waterBody = $(this).val();
        
        searchableDropdown.setEnabled('#dest-country', !!waterBody);
        
        if (waterBody) {
            searchableDropdown.updateSearchParams('#dest-country', { water_body: waterBody });
        }
        
        searchableDropdown.clear('#dest-country');
        searchableDropdown.clear('#dest-port');
        searchableDropdown.setEnabled('#dest-port', false);
        
        updateCalculateButton();
    });

    $('#dest-country').on('change', function() {
        const country = $(this).val();
        const waterBody = $('#dest-water-body').val();
        
        searchableDropdown.setEnabled('#dest-port', !!country);
        
        if (country && waterBody) {
            searchableDropdown.updateSearchParams('#dest-port', { 
                country: country, 
                water_body: waterBody 
            });
        }
        
        searchableDropdown.clear('#dest-port');
        
        updateCalculateButton();
    });

    $('#dest-port').on('change', function() {
        updateCalculateButton();
    });
}

function updateCalculateButton() {
    const originPort = $('#origin-port').val();
    const destPort = $('#dest-port').val();
    
    $('#calculate-route').prop('disabled', !(originPort && destPort));
}