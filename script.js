/**
 * Pullarim - Valyuta Konverter
 * O'zbekiston Markaziy Banki kursi asosida
 */

// DOM Elements
const fromAmountInput = document.getElementById('fromAmount');
const toAmountInput = document.getElementById('toAmount');
const fromCurrencySelect = document.getElementById('fromCurrency');
const toCurrencySelect = document.getElementById('toCurrency');
const swapBtn = document.getElementById('swapBtn');
const loadingEl = document.getElementById('loading');
const rateTextEl = document.getElementById('rateText');
const lastUpdatedEl = document.getElementById('lastUpdated');
const clearBtn = document.getElementById('clearBtn');

// State
let cbuRates = {}; // {USD: {rate: 12850, nominal: 1}, EUR: {...}}
let isLoading = false;
let rawInputValue = '1';

// LocalStorage keys
const STORAGE_KEYS = {
    FROM_CURRENCY: 'pullarim_from_currency',
    TO_CURRENCY: 'pullarim_to_currency',
    LAST_AMOUNT: 'pullarim_last_amount'
};

/**
 * Format number with thousand separators (1,000,000)
 */
function formatWithCommas(value) {
    const numericValue = value.toString().replace(/[^\d.]/g, '');
    const parts = numericValue.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
}

/**
 * Parse formatted number back to raw value
 */
function parseFormattedNumber(formattedValue) {
    return formattedValue.replace(/,/g, '');
}

/**
 * Handle input formatting
 */
function handleInputFormat(e) {
    const input = e.target;
    const cursorPos = input.selectionStart;
    const oldLength = input.value.length;

    rawInputValue = parseFormattedNumber(input.value);
    const formatted = formatWithCommas(rawInputValue);
    input.value = formatted;

    const newLength = formatted.length;
    const diff = newLength - oldLength;
    const newCursorPos = Math.max(0, cursorPos + diff);

    updateClearBtnVisibility();

    setTimeout(() => {
        input.setSelectionRange(newCursorPos, newCursorPos);

        // Save to localStorage
        localStorage.setItem(STORAGE_KEYS.LAST_AMOUNT, rawInputValue);

        debouncedConvert();
    }, 0);
}

/**
 * Save currency preferences to localStorage
 */
function saveCurrencyPreference() {
    localStorage.setItem(STORAGE_KEYS.FROM_CURRENCY, fromCurrencySelect.value);
    localStorage.setItem(STORAGE_KEYS.TO_CURRENCY, toCurrencySelect.value);
}

/**
 * Load currency preferences from localStorage
 */
function loadCurrencyPreference() {
    const savedFrom = localStorage.getItem(STORAGE_KEYS.FROM_CURRENCY);
    const savedTo = localStorage.getItem(STORAGE_KEYS.TO_CURRENCY);
    const savedAmount = localStorage.getItem(STORAGE_KEYS.LAST_AMOUNT);

    if (savedFrom && fromCurrencySelect.querySelector(`option[value="${savedFrom}"]`)) {
        fromCurrencySelect.value = savedFrom;
    }
    if (savedTo && toCurrencySelect.querySelector(`option[value="${savedTo}"]`)) {
        toCurrencySelect.value = savedTo;
    }
    if (savedAmount) {
        rawInputValue = savedAmount;
        fromAmountInput.value = formatWithCommas(savedAmount);
    }
}

/**
 * Fetch exchange rates from Central Bank of Uzbekistan
 */
async function fetchCBURates() {
    if (isLoading) return;

    isLoading = true;
    showLoading(true);

    try {
        const response = await fetch('https://cbu.uz/uz/arkhiv-kursov-valyut/json/');

        if (!response.ok) {
            throw new Error('CBU API response was not ok');
        }

        const data = await response.json();

        // Parse CBU data into our format
        cbuRates = { UZS: { rate: 1, nominal: 1 } }; // Base currency

        data.forEach(item => {
            cbuRates[item.Ccy] = {
                rate: parseFloat(item.Rate),
                nominal: parseInt(item.Nominal),
                name: item.CcyNm_UZ,
                date: item.Date
            };
        });

        // Update last updated time
        if (data.length > 0) {
            lastUpdatedEl.textContent = `Markaziy Bank kursi: ${data[0].Date}`;
            lastUpdatedEl.style.color = '';
        }

        convertCurrency();

    } catch (error) {
        console.error('Error fetching CBU rates:', error);
        lastUpdatedEl.textContent = '⚠️ Kurslarni yuklashda xatolik';
        lastUpdatedEl.style.color = '#f87171';
        showError();
    } finally {
        isLoading = false;
        showLoading(false);
    }
}

/**
 * Convert currency based on current inputs
 */
function convertCurrency() {
    const fromCurrency = fromCurrencySelect.value;
    const toCurrency = toCurrencySelect.value;
    const amount = parseFloat(rawInputValue) || 0;

    if (Object.keys(cbuRates).length === 0) {
        fetchCBURates();
        return;
    }

    // Get rates (all rates are relative to UZS)
    const fromRate = cbuRates[fromCurrency];
    const toRate = cbuRates[toCurrency];

    if (!fromRate || !toRate) {
        showError();
        return;
    }

    // Calculate: First convert to UZS, then to target currency
    // fromCurrency -> UZS: amount * (rate / nominal)
    // UZS -> toCurrency: uzsAmount / (rate / nominal)

    let result;
    if (fromCurrency === 'UZS') {
        // UZS to other currency
        const ratePerUnit = toRate.rate / toRate.nominal;
        result = amount / ratePerUnit;
    } else if (toCurrency === 'UZS') {
        // Other currency to UZS
        const ratePerUnit = fromRate.rate / fromRate.nominal;
        result = amount * ratePerUnit;
    } else {
        // Cross-rate: from -> UZS -> to
        const fromRatePerUnit = fromRate.rate / fromRate.nominal;
        const toRatePerUnit = toRate.rate / toRate.nominal;
        const uzsAmount = amount * fromRatePerUnit;
        result = uzsAmount / toRatePerUnit;
    }

    toAmountInput.value = formatResultNumber(result, toCurrency);
    updateRateDisplay(fromCurrency, toCurrency);
}

/**
 * Format result number based on currency
 */
function formatResultNumber(number, currency) {
    const noDecimalCurrencies = ['JPY', 'KRW', 'UZS', 'KZT', 'VND', 'IDR'];

    if (noDecimalCurrencies.includes(currency)) {
        return Math.round(number).toLocaleString('en-US', { maximumFractionDigits: 0 });
    }

    return number.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4
    });
}

/**
 * Update the exchange rate display
 */
function updateRateDisplay(from, to) {
    const fromRate = cbuRates[from];
    const toRate = cbuRates[to];

    if (!fromRate || !toRate) return;

    let rate;
    if (from === 'UZS') {
        rate = 1 / (toRate.rate / toRate.nominal);
    } else if (to === 'UZS') {
        rate = fromRate.rate / fromRate.nominal;
    } else {
        const fromRatePerUnit = fromRate.rate / fromRate.nominal;
        const toRatePerUnit = toRate.rate / toRate.nominal;
        rate = fromRatePerUnit / toRatePerUnit;
    }

    const formattedRate = formatResultNumber(rate, to);
    rateTextEl.innerHTML = `1 ${from} = <span class="highlight">${formattedRate}</span> ${to}`;
    rateTextEl.style.color = '';
}

/**
 * Show/hide loading state
 */
function showLoading(show) {
    loadingEl.style.display = show ? 'flex' : 'none';
    rateTextEl.style.display = show ? 'none' : 'inline';
}

/**
 * Show error message
 */
function showError() {
    rateTextEl.innerHTML = '⚠️ Kurslarni yuklashda xatolik';
    rateTextEl.style.color = '#f87171';
}

/**
 * Swap currencies
 */
function swapCurrencies() {
    const tempCurrency = fromCurrencySelect.value;
    fromCurrencySelect.value = toCurrencySelect.value;
    toCurrencySelect.value = tempCurrency;

    rawInputValue = parseFormattedNumber(toAmountInput.value);
    fromAmountInput.value = formatWithCommas(rawInputValue);

    saveCurrencyPreference();
    convertCurrency();
}

/**
 * Debounce function
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Update clear button visibility
 */
function updateClearBtnVisibility() {
    if (rawInputValue && parseFloat(rawInputValue) > 0) {
        clearBtn.style.display = 'block';
    } else {
        clearBtn.style.display = 'none';
    }
}

// Clear button event listener
clearBtn.addEventListener('click', () => {
    fromAmountInput.value = '';
    rawInputValue = '';
    updateClearBtnVisibility();
    fromAmountInput.focus();
    convertCurrency();
});

const debouncedConvert = debounce(convertCurrency, 300);

// Event Listeners
fromAmountInput.addEventListener('input', handleInputFormat);

fromCurrencySelect.addEventListener('change', () => {
    saveCurrencyPreference();
    convertCurrency();
});

toCurrencySelect.addEventListener('change', () => {
    saveCurrencyPreference();
    convertCurrency();
});

swapBtn.addEventListener('click', swapCurrencies);

fromAmountInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        convertCurrency();
    }
});

// Prevent non-numeric input
fromAmountInput.addEventListener('keydown', (e) => {
    if ([8, 46, 9, 27, 13, 110, 190].includes(e.keyCode) ||
        (e.keyCode >= 65 && e.keyCode <= 90 && (e.ctrlKey || e.metaKey)) ||
        (e.keyCode >= 35 && e.keyCode <= 39)) {
        return;
    }
    if ((e.shiftKey || (e.keyCode < 48 || e.keyCode > 57)) && (e.keyCode < 96 || e.keyCode > 105)) {
        e.preventDefault();
    }
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadCurrencyPreference();
    loadCurrencyPreference();
    fetchCBURates();
    updateClearBtnVisibility();
});

// Auto-refresh rates every 30 minutes
setInterval(() => {
    if (!document.hidden) {
        fetchCBURates();
    }
}, 30 * 60 * 1000);

// Refresh when tab becomes visible
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        fetchCBURates();
    }
});
