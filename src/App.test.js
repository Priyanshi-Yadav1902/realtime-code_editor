import { render, screen } from '@testing-library/react';
import App from './App';

test('renders home page prompt', () => {
  render(<App />);
  const linkElement = screen.getByText(/paste invitation room id/i);
  expect(linkElement).toBeInTheDocument();
});
