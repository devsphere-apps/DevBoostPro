import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Starting tests...');

  test('Extension should be present', () => {
    assert.ok(vscode.extensions.getExtension('publisher.devboost-pro'));
  });

  test('Should activate', function() {
    this.timeout(10000);
    return vscode.extensions.getExtension('publisher.devboost-pro')?.activate().then(() => {
      assert.ok(true);
    });
  });
}); 