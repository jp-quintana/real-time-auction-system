import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

export function AtLeastOneField<T>(
  fields: (keyof T)[],
  validationOptions?: ValidationOptions,
) {
  return function (constructor: Function) {
    registerDecorator({
      name: 'atLeastOneField',
      target: constructor,
      propertyName: '',
      options: {
        message: `At least one of the following fields must be provided: ${fields.join(', ')}`,
        ...validationOptions,
      },
      validator: {
        validate(_: any, args: ValidationArguments) {
          const object = args.object as Record<string, unknown>;
          return fields.some((field) => object[field as string] !== undefined);
        },
      },
    });
  };
}
