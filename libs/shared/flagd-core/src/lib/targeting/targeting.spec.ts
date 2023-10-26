import {Targeting} from "./targeting";

describe("String comparison evaluator", () => {

  let targeting: Targeting;

  beforeAll(() => {
    targeting = new Targeting();
  })

  it("should evaluate starts with calls", () => {
    const input = JSON.parse('{\n' +
      '  "starts_with": [\n' +
      '    {"var":  "email"},\n' +
      '    "admin"\n' +
      '  ]\n' +
      '}')


    expect(targeting.apply(input, {email: "admin@abc.com"})).toBeTruthy()
  });

  it("should evaluate ends with calls", () => {
    const input = JSON.parse('{\n' +
      '  "ends_with": [\n' +
      '    {"var":  "email"},\n' +
      '    "abc.com"\n' +
      '  ]\n' +
      '}')

    expect(targeting.apply(input, {email: "admin@abc.com"})).toBeTruthy()
  });

});
