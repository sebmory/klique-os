import type {
  ButtonHTMLAttributes,
  CSSProperties,
  HTMLAttributes,
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TableHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { componentTokens } from "./tokens";

type TokenStyle = Record<`--ds-${string}`, string>;

const withTokenStyle = (style: CSSProperties | undefined, tokenStyle: TokenStyle): CSSProperties => {
  return {
    ...tokenStyle,
    ...style,
  } as CSSProperties;
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;
export const Button = ({ style, ...props }: ButtonProps) => (
  <button
    {...props}
    data-ds="Button"
    style={withTokenStyle(style, {
      "--ds-bg": componentTokens.button.background,
      "--ds-text": componentTokens.button.text,
      "--ds-radius": componentTokens.button.radius,
      "--ds-shadow": componentTokens.button.shadow,
      "--ds-transition": componentTokens.button.transition,
    })}
  />
);

export type InputProps = InputHTMLAttributes<HTMLInputElement>;
export const Input = ({ style, ...props }: InputProps) => (
  <input
    {...props}
    data-ds="Input"
    style={withTokenStyle(style, {
      "--ds-bg": componentTokens.input.background,
      "--ds-text": componentTokens.input.text,
      "--ds-border": componentTokens.input.border,
      "--ds-radius": componentTokens.input.radius,
      "--ds-focus": componentTokens.input.focus,
      "--ds-transition": componentTokens.input.transition,
    })}
  />
);

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;
export const Textarea = ({ style, ...props }: TextareaProps) => (
  <textarea
    {...props}
    data-ds="Textarea"
    style={withTokenStyle(style, {
      "--ds-bg": componentTokens.textarea.background,
      "--ds-text": componentTokens.textarea.text,
      "--ds-border": componentTokens.textarea.border,
      "--ds-radius": componentTokens.textarea.radius,
      "--ds-transition": componentTokens.textarea.transition,
    })}
  />
);

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;
export const Select = ({ style, ...props }: SelectProps) => (
  <select
    {...props}
    data-ds="Select"
    style={withTokenStyle(style, {
      "--ds-bg": componentTokens.select.background,
      "--ds-text": componentTokens.select.text,
      "--ds-border": componentTokens.select.border,
      "--ds-radius": componentTokens.select.radius,
      "--ds-transition": componentTokens.select.transition,
    })}
  />
);

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;
export const Checkbox = ({ style, ...props }: CheckboxProps) => (
  <input
    {...props}
    type="checkbox"
    data-ds="Checkbox"
    style={withTokenStyle(style, {
      "--ds-border": componentTokens.checkbox.border,
      "--ds-focus": componentTokens.checkbox.focus,
      "--ds-transition": componentTokens.checkbox.transition,
    })}
  />
);

export type RadioProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;
export const Radio = ({ style, ...props }: RadioProps) => (
  <input
    {...props}
    type="radio"
    data-ds="Radio"
    style={withTokenStyle(style, {
      "--ds-border": componentTokens.radio.border,
      "--ds-focus": componentTokens.radio.focus,
      "--ds-transition": componentTokens.radio.transition,
    })}
  />
);

export type SwitchProps = ButtonHTMLAttributes<HTMLButtonElement>;
export const Switch = ({ style, ...props }: SwitchProps) => (
  <button
    {...props}
    role="switch"
    data-ds="Switch"
    style={withTokenStyle(style, {
      "--ds-bg": componentTokens.switch.background,
      "--ds-active": componentTokens.switch.active,
      "--ds-radius": componentTokens.switch.radius,
      "--ds-transition": componentTokens.switch.transition,
    })}
  />
);

export type BadgeProps = HTMLAttributes<HTMLSpanElement>;
export const Badge = ({ style, ...props }: BadgeProps) => (
  <span
    {...props}
    data-ds="Badge"
    style={withTokenStyle(style, {
      "--ds-bg": componentTokens.badge.background,
      "--ds-text": componentTokens.badge.text,
      "--ds-radius": componentTokens.badge.radius,
    })}
  />
);

export type AvatarProps = HTMLAttributes<HTMLDivElement>;
export const Avatar = ({ style, ...props }: AvatarProps) => (
  <div
    {...props}
    data-ds="Avatar"
    style={withTokenStyle(style, {
      "--ds-bg": componentTokens.avatar.background,
      "--ds-text": componentTokens.avatar.text,
      "--ds-radius": componentTokens.avatar.radius,
    })}
  />
);

export type CardProps = HTMLAttributes<HTMLElement>;
export const Card = ({ style, ...props }: CardProps) => (
  <article
    {...props}
    data-ds="Card"
    style={withTokenStyle(style, {
      "--ds-bg": componentTokens.card.background,
      "--ds-border": componentTokens.card.border,
      "--ds-radius": componentTokens.card.radius,
      "--ds-shadow": componentTokens.card.shadow,
    })}
  />
);

export type ModalProps = HTMLAttributes<HTMLDivElement>;
export const Modal = ({ style, ...props }: ModalProps) => (
  <div
    {...props}
    role="dialog"
    data-ds="Modal"
    style={withTokenStyle(style, {
      "--ds-bg": componentTokens.modal.background,
      "--ds-overlay": componentTokens.modal.overlay,
      "--ds-radius": componentTokens.modal.radius,
      "--ds-shadow": componentTokens.modal.shadow,
      "--ds-transition": componentTokens.modal.transition,
    })}
  />
);

export type DrawerProps = HTMLAttributes<HTMLElement>;
export const Drawer = ({ style, ...props }: DrawerProps) => (
  <aside
    {...props}
    data-ds="Drawer"
    style={withTokenStyle(style, {
      "--ds-bg": componentTokens.drawer.background,
      "--ds-border": componentTokens.drawer.border,
      "--ds-shadow": componentTokens.drawer.shadow,
      "--ds-transition": componentTokens.drawer.transition,
    })}
  />
);

export type TooltipProps = HTMLAttributes<HTMLDivElement>;
export const Tooltip = ({ style, ...props }: TooltipProps) => (
  <div
    {...props}
    role="tooltip"
    data-ds="Tooltip"
    style={withTokenStyle(style, {
      "--ds-bg": componentTokens.tooltip.background,
      "--ds-text": componentTokens.tooltip.text,
      "--ds-radius": componentTokens.tooltip.radius,
      "--ds-shadow": componentTokens.tooltip.shadow,
      "--ds-transition": componentTokens.tooltip.transition,
    })}
  />
);

export type PopoverProps = HTMLAttributes<HTMLDivElement>;
export const Popover = ({ style, ...props }: PopoverProps) => (
  <div
    {...props}
    role="dialog"
    data-ds="Popover"
    style={withTokenStyle(style, {
      "--ds-bg": componentTokens.popover.background,
      "--ds-border": componentTokens.popover.border,
      "--ds-radius": componentTokens.popover.radius,
      "--ds-shadow": componentTokens.popover.shadow,
      "--ds-transition": componentTokens.popover.transition,
    })}
  />
);

export type DropdownProps = HTMLAttributes<HTMLDivElement>;
export const Dropdown = ({ style, ...props }: DropdownProps) => (
  <div
    {...props}
    data-ds="Dropdown"
    style={withTokenStyle(style, {
      "--ds-bg": componentTokens.dropdown.background,
      "--ds-border": componentTokens.dropdown.border,
      "--ds-radius": componentTokens.dropdown.radius,
      "--ds-shadow": componentTokens.dropdown.shadow,
      "--ds-transition": componentTokens.dropdown.transition,
    })}
  />
);

export type TabsProps = HTMLAttributes<HTMLDivElement>;
export const Tabs = ({ style, ...props }: TabsProps) => (
  <div
    {...props}
    data-ds="Tabs"
    style={withTokenStyle(style, {
      "--ds-bg": componentTokens.tabs.background,
      "--ds-active": componentTokens.tabs.active,
      "--ds-text": componentTokens.tabs.text,
      "--ds-transition": componentTokens.tabs.transition,
    })}
  />
);

export type TableProps = TableHTMLAttributes<HTMLTableElement>;
export const Table = ({ style, ...props }: TableProps) => (
  <table
    {...props}
    data-ds="Table"
    style={withTokenStyle(style, {
      "--ds-bg": componentTokens.table.background,
      "--ds-border": componentTokens.table.border,
      "--ds-text": componentTokens.table.text,
    })}
  />
);

export type PaginationProps = HTMLAttributes<HTMLElement>;
export const Pagination = ({ style, ...props }: PaginationProps) => (
  <nav
    {...props}
    data-ds="Pagination"
    style={withTokenStyle(style, {
      "--ds-border": componentTokens.pagination.border,
      "--ds-text": componentTokens.pagination.text,
      "--ds-active": componentTokens.pagination.active,
      "--ds-transition": componentTokens.pagination.transition,
    })}
  />
);

export type BreadcrumbProps = HTMLAttributes<HTMLElement>;
export const Breadcrumb = ({ style, ...props }: BreadcrumbProps) => (
  <nav
    {...props}
    data-ds="Breadcrumb"
    style={withTokenStyle(style, {
      "--ds-text": componentTokens.breadcrumb.text,
      "--ds-active": componentTokens.breadcrumb.active,
      "--ds-transition": componentTokens.breadcrumb.transition,
    })}
  />
);

export type ToastProps = HTMLAttributes<HTMLDivElement>;
export const Toast = ({ style, ...props }: ToastProps) => (
  <div
    {...props}
    role="status"
    data-ds="Toast"
    style={withTokenStyle(style, {
      "--ds-bg": componentTokens.toast.background,
      "--ds-border": componentTokens.toast.border,
      "--ds-radius": componentTokens.toast.radius,
      "--ds-shadow": componentTokens.toast.shadow,
      "--ds-transition": componentTokens.toast.transition,
    })}
  />
);

export type SkeletonProps = HTMLAttributes<HTMLDivElement>;
export const Skeleton = ({ style, ...props }: SkeletonProps) => (
  <div
    {...props}
    aria-hidden="true"
    data-ds="Skeleton"
    style={withTokenStyle(style, {
      "--ds-bg": componentTokens.skeleton.background,
      "--ds-radius": componentTokens.skeleton.radius,
      "--ds-animation": componentTokens.skeleton.animation,
    })}
  />
);

export type LoaderProps = HTMLAttributes<HTMLDivElement>;
export const Loader = ({ style, ...props }: LoaderProps) => (
  <div
    {...props}
    role="status"
    aria-live="polite"
    data-ds="Loader"
    style={withTokenStyle(style, {
      "--ds-color": componentTokens.loader.color,
      "--ds-animation": componentTokens.loader.animation,
    })}
  />
);

export type EmptyStateProps = HTMLAttributes<HTMLElement>;
export const EmptyState = ({ style, ...props }: EmptyStateProps) => (
  <section
    {...props}
    data-ds="EmptyState"
    style={withTokenStyle(style, {
      "--ds-bg": componentTokens.emptyState.background,
      "--ds-text": componentTokens.emptyState.text,
      "--ds-border": componentTokens.emptyState.border,
      "--ds-radius": componentTokens.emptyState.radius,
    })}
  />
);
