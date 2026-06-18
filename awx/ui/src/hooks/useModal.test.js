import React from 'react';
import { render, act } from '@testing-library/react';
import useModal from './useModal';

const result = { current: null };
const latest = () => result.current;

const TestHook = ({ initialValue }) => {
  result.current = useModal(initialValue);
  return null;
};

const testHook = (initialValue) => {
  render(<TestHook initialValue={initialValue} />);
};

describe('useModal hook', () => {
  test('isModalOpen should return expected default value', () => {
    testHook();
    expect(latest().isModalOpen).toEqual(false);
    expect(latest().toggleModal).toBeInstanceOf(Function);
    expect(latest().closeModal).toBeInstanceOf(Function);
  });

  test('isModalOpen should return expected initialized value', () => {
    testHook(true);
    expect(latest().isModalOpen).toEqual(true);
    expect(latest().toggleModal).toBeInstanceOf(Function);
    expect(latest().closeModal).toBeInstanceOf(Function);
  });

  test('should return expected isModalOpen value after modal toggle', () => {
    testHook();
    expect(latest().isModalOpen).toEqual(false);
    act(() => {
      latest().toggleModal();
    });
    expect(latest().isModalOpen).toEqual(true);
  });

  test('isModalOpen should be false after closeModal is called', () => {
    testHook();
    expect(latest().isModalOpen).toEqual(false);
    act(() => {
      latest().toggleModal();
    });
    expect(latest().isModalOpen).toEqual(true);
    act(() => {
      latest().closeModal();
    });
    expect(latest().isModalOpen).toEqual(false);
  });
});
