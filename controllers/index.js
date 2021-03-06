'use strict';

/*** ENVIRONMENT ***/
const DEV = process.env.NODE_ENV === 'development';
const path = require('path');

/*** MODEL ***/
const Url = require('../models/Url');

/*** TOOLS ***/
const sha256 = require('crypto-js/sha256');
const isURL = require('validator/lib/isURL');
const blocklist = require('./blocklists/');

/*** MU - NODE MUSTACHE TEMPLATING ***/
const mu = require('mu2');

// Dynamic HTML generation
mu.root = path.join(__dirname, '../views');

// A function to update mustache variables and render
const mupdate = (obj, response) => {
  if (DEV) {
    mu.clearCache(); // This is helpful for development to ensure changes are always reflected, but it hurts speed
  }
  const stream = mu.compileAndRender('index.html', obj);
  stream.pipe(response);
};

/*** CONTROLLERS ***/
// Controllers constructor
function Controllers() {
  // Common variables
  let long_url,
    short_url, // Values will be both shown and stored to database
    visible; // Object used as mupdate parameter

  // Root
  // Display root page using mustache
  this.root = (req, res) => {
    visible = {
      home: true,
      links: false,
      error: false,
      blocked: false,
      long_url,
      short_url,
    };
    mupdate(visible, res);
  };

  // Create new
  // Post a new URL
  this.postUrl = (req, res) => {
    const { url_entry } = req.body;
    if (DEV) {
      console.log('BODY:', req.body);
      console.log('url_entry:', url_entry);
    }
    // Check that it's a valid URL
    const valid = isURL(url_entry, { require_protocol: true });
    const blocked = blocklist.map(i => url_entry.includes(i)).filter(j => j === true)[0] || false;

    // If url_entry is NOT valid
    if (!valid) {
      if (DEV) {
        console.error('Invalid entry!');
      }
      //Show a blocked page
      visible = {
        home: false,
        links: false,
        error: true,
        blocked: false,
        long_url,
        short_url,
      };
      mupdate(visible, res);
      // If url_entry is blocked
    } else if (blocked) {
      if (DEV) {
        console.error('Blocked:', blocked);
      }
      //Show a blocked page
      visible = {
        home: false,
        links: false,
        error: false,
        blocked: true,
        long_url: url_entry,
        short_url,
      };
      mupdate(visible, res);
    } else {
      // Otherwise, search the db to see if we've already got a copy of this url_entry
      Url.findOne(
        {
          long_url: url_entry,
        },
        (err, matches) => {
          if (err) {
            console.error(err);
          }
          // If there is a match to something already in the db
          if (matches) {
            // Show the links page without creating a new entry
            if (DEV) {
              console.log('We\'ve got a duplicate! It\'s', matches);
            }
            long_url = matches.long_url;
            short_url = matches.short_url;
            visible = {
              home: false,
              links: true,
              error: false,
              blocked: false,
              long_url,
              short_url,
            };
            mupdate(visible, res);
            // res.json(matches);
            // If we wanted to just show a JSON object, we'd use this instead of mupdate
          } else {
            // If no matches, create a new entry for the database, insert it, and display a links page
            long_url = url_entry;
            // short_url is the first 5 digits of the long_url's sha256 hash
            short_url = sha256(url_entry)
              .toString()
              .split('')
              .slice(0, 5)
              .join('');

            visible = {
              home: false,
              links: true,
              error: false,
              blocked: false,
              long_url,
              short_url,
            };

            const dbEntry = new Url({
              long_url,
              short_url,
            });

            dbEntry.save((err, doc) => {
              if (err) {
                console.error(err);
              }
              console.log('Inserted', JSON.stringify(doc));
            });

            mupdate(visible, res);
            // res.json(dbEntry);
            // If we wanted to just show a JSON object, we'd use this instead of mupdate
          }
        }
      );
    }
  };

  // Visit
  // Visit a new URL
  this.visit = (req, res) => {
    // See if the :url is a short_url
    Url.findOne(
      {
        short_url: req.params.url,
      },
      (err, matches) => {
        if (err) {
          console.error(err);
        }

        // If :url matches a short_url, redirect to the long_url
        if (matches) {
          console.log('Redirecting to', matches.long_url);
          res.redirect(matches.long_url);
          // Otherwise, show an error page
        } else {
          console.error('No matches');
          mu.clearCache();
          visible = {
            home: false,
            links: false,
            error: true,
            blocked: false,
            long_url,
            short_url,
          };
          mupdate(visible, res);
        }
      }
    );
  };
}

module.exports = Controllers;
