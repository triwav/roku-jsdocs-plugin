#!/bin/bash
npm run docs
test_status=$?
[ $test_status -eq 0 ] && echo "Test successful" || echo "Test failed"
exit $test_status