/**
 * Generic utility functions, shared between all runtime.
 * Functions dependent on runtime apis of deno / node.js may not be put here,
 * but should be node.js or deno specific util files.
 *
 * @license
 * Copyright (c) 2021 RethinkDNS and its authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
// musn't import any non-std modules

export function fromBrowser(ua) {
  return ua && ua.startsWith("Mozilla/5.0");
}

export function jsonHeaders() {
  return {
    "Content-Type": "application/json",
  };
}

export function dnsHeaders() {
  return {
    "Accept": "application/dns-message",
    "Content-Type": "application/dns-message",
  };
}

export function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

/**
 * @param {String} ua - User Agent string
 * @return {Object}
 */
export function corsHeadersIfNeeded(ua) {
  // allow cors when user agents claiming to be browsers
  return fromBrowser(ua) ? corsHeaders() : {};
}

export function browserHeaders() {
  return Object.assign(jsonHeaders(), corsHeaders());
}

/**
 * @param {String} ua - User Agent string
 * @return {Object} - Headers
 */
export function dohHeaders(ua) {
  return Object.assign(dnsHeaders(), corsHeadersIfNeeded(ua));
}

export function contentLengthHeader(b) {
  const len = !b || !b.byteLength ? "0" : b.byteLength.toString();
  return { "Content-Length": len };
}

export function concatHeaders(...args) {
  return concatObj(...args);
}

export function rxidHeader(id) {
  return { "x-rethinkdns-rxid": id };
}

export function rxidFromHeader(h) {
  if (!h || !h.get) return null;
  return h.get("x-rethinkdns-rxid");
}

/**
 * @param {Request} request - Request
 * @return {Object} - Headers
 */
export function copyHeaders(request) {
  const headers = {};
  if (!request || !request.headers) return headers;

  // Object.assign, Object spread, etc don't work
  request.headers.forEach((val, name) => {
    headers[name] = val;
  });
  return headers;
}
export function copyNonPseudoHeaders(req) {
  const headers = {};
  if (!req || !req.headers) return headers;

  // drop http/2 pseudo-headers
  for (const name in req.headers) {
    if (name.startsWith(":")) continue;
    headers[name] = req.headers[name];
  }
  return headers;
}

/**
 * Promise that resolves after `ms`
 * @param {number} ms - Milliseconds to sleep
 * @return {Promise}
 */
export function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function objOf(map) {
  return map.entries ? Object.fromEntries(map) : {};
}

export function timedOp(op, ms, cleanup) {
  let tid = null;
  let resolve = null;
  let reject = null;
  const promiser = (accept, deny) => {
    resolve = accept;
    reject = deny;
  };
  const p = new Promise(promiser);

  let timedout = false;
  tid = timeout(ms, () => {
    timedout = true;
    reject("timeout");
  });

  try {
    op((out, ex) => {
      if (timedout) {
        cleanup(out);
        return;
      }

      clearTimeout(tid);

      if (ex) {
        reject(ex.message);
      } else {
        resolve(out);
      }
    });
  } catch (ex) {
    if (!timedout) reject(ex.message);
  }
  return p;
}

export function timeout(ms, callback) {
  if (typeof callback !== "function") return -1;
  return setTimeout(callback, ms);
}

// stackoverflow.com/a/8084248
export function uid() {
  // ex: ".ww8ja208it"
  return (Math.random() + 1).toString(36).slice(1);
}

export function xid() {
  const hi = uid().slice(1);
  const lo = uid();
  return hi + lo;
}

// queues fn in a macro-task queue of the event-loop
// exec order: github.com/nodejs/node/issues/22257
export function taskBox(fn) {
  timeout(/* with 0ms delay*/ 0, () => safeBox(fn));
}

// queues fn in a micro-task queue
// ref: MDN: Web/API/HTML_DOM_API/Microtask_guide/In_depth
// queue-task polyfill: stackoverflow.com/a/61605098
export function microtaskBox(...fns) {
  let enqueue = null;
  if (typeof queueMicroTask === "function") {
    enqueue = queueMicroTask;
  } else {
    const p = Promise.resolve();
    enqueue = p.then.bind(p);
  }

  enqueue(() => safeBox(...fns));
}

export function safeBox(...fns) {
  const r = [];
  for (const f of fns) {
    if (typeof f !== "function") {
      r.push(null);
      continue;
    }
    try {
      r.push(f());
    } catch (ignore) {
      r.push(null);
    }
  }
  return r;
}

/**
 * @param {Request} req - Request
 * @return {Boolean}
 */
export function isDnsMsg(req) {
  return (
    req.headers.get("Accept") === "application/dns-message" ||
    req.headers.get("Content-Type") === "application/dns-message"
  );
}

export function emptyResponse() {
  return {
    isException: false,
    exceptionStack: "",
    exceptionFrom: "",
    data: {},
  };
}

export function errResponse(id, err) {
  return {
    isException: true,
    exceptionStack: err.stack,
    exceptionFrom: id,
    data: {},
  };
}

export function mapOf(obj) {
  return new Map(Object.entries(obj));
}

export function emptyString(str) {
  // treat false-y values as empty
  if (!str) return true;
  // check if str is indeed a str
  if (typeof str !== "string") return false;
  // if len(str) is 0, str is empty
  return str.trim().length === 0;
}

export function emptyArray(a) {
  // treat false-y values as empty
  if (!a) return true;
  // obj v arr: stackoverflow.com/a/2462810
  if (typeof a !== "object") return false;
  // len(a) === 0 is empty
  return !!a.length && a.length <= 0;
}

export function concatObj(...args) {
  return Object.assign(...args);
}

export function emptyObj(x) {
  // note: Object.keys type-errors when x is null / undefined
  return !x || Object.keys(x).length <= 0;
}

export function respond204() {
  return new Response(null, {
    status: 204, // no content
    headers: corsHeaders(),
  });
}

export function respond400() {
  return new Response(null, {
    status: 400,
    statusText: "Bad Request",
  });
}

export function respond405() {
  return new Response(null, {
    status: 405,
    statusText: "Method Not Allowed",
  });
}

export function respond503() {
  return new Response(null, {
    status: 503, // unavailable
    headers: dnsHeaders(),
  });
}

export function logger(...tags) {
  if (!log) return null;

  return log.withTags(...tags);
}

export function isPostRequest(req) {
  return req && !emptyString(req.method) && req.method.toUpperCase() === "POST";
}

export function isGetRequest(req) {
  return req && !emptyString(req.method) && req.method.toUpperCase() === "GET";
}