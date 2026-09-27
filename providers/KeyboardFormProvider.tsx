import { createContext, useContext, useMemo, useRef, type PropsWithChildren, type RefObject } from 'react';
import { Keyboard, TextInput } from 'react-native';

type FormKeyboardState = {
  reserve: (id: string) => void;
  register: (id: string, input: RefObject<TextInput | null>) => () => void;
  focusNext: (id: string) => void;
};
const FormKeyboardContext = createContext<FormKeyboardState | null>(null);

/** Keeps text inputs ordered so the keyboard Next key moves through a form. */
export function KeyboardFormProvider({ children }: PropsWithChildren) {
  const fields = useRef(new Map<string, RefObject<TextInput | null>>());
  const order = useRef(new Map<string, number>());
  const nextOrder = useRef(0);
  const value = useMemo<FormKeyboardState>(() => ({
    reserve(id) {
      if (!order.current.has(id)) order.current.set(id, nextOrder.current++);
    },
    register(id, input) {
      fields.current.set(id, input);
      return () => fields.current.delete(id);
    },
    focusNext(id) {
      const ordered = [...fields.current.entries()].sort(([a], [b]) => (order.current.get(a) ?? 0) - (order.current.get(b) ?? 0));
      const currentIndex = ordered.findIndex(([fieldId]) => fieldId === id);
      const next = currentIndex < 0 ? null : ordered[currentIndex + 1]?.[1].current;
      if (next) next.focus();
      else Keyboard.dismiss();
    },
  }), []);
  return <FormKeyboardContext.Provider value={value}>{children}</FormKeyboardContext.Provider>;
}

export function useFormKeyboard() {
  return useContext(FormKeyboardContext);
}
