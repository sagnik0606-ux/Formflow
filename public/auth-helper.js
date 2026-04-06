// Shared auth helpers — included in dashboard.html and myResponses.html

function getToken() {
    return localStorage.getItem("ff_token");
}

function authHeaders(extra = {}) {
    return { "Content-Type": "application/json", "Authorization": `Bearer ${getToken()}`, ...extra };
}

// Authenticated fetch wrapper
async function authFetch(url, options = {}) {
    const res = await fetch(url, {
        ...options,
        headers: { ...authHeaders(), ...(options.headers || {}) }
    });
    if (res.status === 401) {
        localStorage.removeItem("ff_token");
        location.replace("signin.html");
    }
    return res;
}
