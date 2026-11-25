"""Ensure the local Python runner is allowlisted and does not expose shell access."""
import unittest
from unittest.mock import patch
from app.services import python_test_runner as runner


class PythonRunnerTests(unittest.TestCase):
    def test_only_developer_loopback_is_accepted(self):
        with patch.dict('os.environ', {'PHISHLAB_ENABLE_TEST_RUNNER': '1'}):
            self.assertTrue(runner.testing_allowed('127.0.0.1'))
            self.assertFalse(runner.testing_allowed('192.168.1.1'))
        with patch.dict('os.environ', {'PHISHLAB_ENABLE_TEST_RUNNER': '0'}):
            self.assertFalse(runner.testing_allowed('127.0.0.1'))

    def test_file_and_function_discovery(self):
        selected = {entry['id']: entry for entry in runner.list_tests()}
        self.assertIn('test_classifier_evaluation.py', selected)
        self.assertTrue(any('test_confusion_matrix_and_metrics' in fn['name']
                            for fn in selected['test_classifier_evaluation.py']['functions']))

    def test_rejects_arbitrary_code_and_paths(self):
        for candidate in ('../secrets.py', '-c print(1)', 'test_classifier_evaluation.py::os.system',
                          'test_nonexistent.py', 'test_classifier_evaluation.py --help'):
            with self.subTest(candidate=candidate), self.assertRaises(ValueError):
                runner.run_test(candidate)

    def test_single_discovered_function_runs_in_subprocess(self):
        result = runner.run_test('test_classifier_evaluation.py::ClassifierEvaluationTests.test_confusion_matrix_and_metrics')
        self.assertEqual(result['status'], 'passed', result['output'])
        self.assertIn('OK', result['output'])


if __name__ == '__main__':
    unittest.main()
